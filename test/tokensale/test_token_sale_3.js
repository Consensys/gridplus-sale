// Test for token sale #2
// NOTE: This is meant to be run either in testrpc or on a node with instant-sealing
//       such that 1 transaction == 1 block
var assert = require('chai').assert;
var Promise = require('bluebird').Promise;
var config = require('../../config.js');
var ethutil = require('ethereumjs-util')
var util = require('../util.js');

//====================================
// SALE VARIABLES
//====================================

let accounts = [];
let Rmax;
let start_block;
let end_block;
let sale = config.token_sale.three;
let amt = 9000000000000000 // The amount everyone will contribute

//====================================
// BLOCK TIMING constants
//====================================

// Number of total accounts
const N_ACCT = 200;

// Number of accounts designed to be excluded (i.e. fail to contribute)
// These always come AFTER the sale has ended (i.e. that is the souce of their failure)
const N_FAIL = 0;

// Number of presale participants
const N_PRESALE = 50;

// Each pre-saler gets white listed and then contributes
// This accounts for a total of two transactions/blocks per presaler
const START_WAIT = 2*N_PRESALE;

// Number of transactions to occur while the sale is underway
const NUM_TXN = N_ACCT - N_PRESALE - N_FAIL;

// Number of transactions after the end_block of the sale
const POST_SALE_TXN = 5;


//====================================
// TESTS
//====================================

describe('Setup', function(done) {
  it(`Should create ${N_ACCT} accounts`, function(done) {
    this.timeout(120000)
    util.createAccounts(N_ACCT)
    .then((_accounts) => {
      accounts = _accounts;
      assert.equal(accounts.length, N_ACCT);
      done();
    })
  })

  it('Should send a faucet request from each account', function(done) {
    this.timeout(240000);
    util.FaucetAccounts(accounts)
    .then((success) => { return Promise.delay(1000); })
    .then(() => { done(); })
  })

  it('Should get the starting block, ending block, and cap', function(done) {
    let start_data = '0xbe9a6555';
    let end_data = '0xefbe1c1c';
    let Rmax_data = '0x699adf45';
    let current_block = config.web3.eth.blockNumber;
    util.call(sale, start_data)
    .then((start) => {
      assert.equal(current_block+START_WAIT, parseInt(start), "Sale does not start on this bock.")
      start_block = parseInt(start);
      return util.call(sale, end_data)
    })
    .then((end) => {
      end_block = parseInt(end);
      let exp_end = current_block+START_WAIT+NUM_TXN
      assert.equal(exp_end, parseInt(end), "Sale end is the wrong block.");
      return util.call(sale, Rmax_data);
    })
    .then((_Rmax) => {
      Rmax = parseInt(_Rmax);
      done()
    })
  })

  it('Should make sure the auction has enough GRID', function(done) {
    let grid_data = `0xbb654d16`
    util.call(sale, grid_data)
    .then((_grid_addr) => {
      let grid_addr = `0x${_grid_addr.substr(26, 40)}`
      assert.equal(grid_addr, config.addresses.grid, 'GRID addr inside contract is wrong')
      let bal_data = `0x70a08231${util.zfill(sale)}`
      return util.call(config.addresses.grid, bal_data)
    })
    .then((balance) => {
      assert.equal(parseInt(balance), 160000000*Math.pow(10, 18))
      done();
    })
  })
})
/*
describe('Pre-sale', function(done) {
  it('Should whitelist accouts 1 and 2 to participate in the pre-sale', function(done) {
    Promise.resolve(accounts.slice(0,2))
    .map((a) => {
      let data = `0xd5b07066${util.zfill(a.address)}`;
      let unsigned = util.formUnsigned(config.addresses.admin, sale, data, 0);
      return util.sendTxPromise(unsigned, config.setup.admin_pkey)
    })
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should let the presalers contribute', function(done) {
    Promise.resolve(accounts.slice(0, 2))
    .map((a) => {
      let unsigned = util.formUnsigned(a.address, sale, 0, amt)
      return util.sendTxPromise(unsigned, a.privateKey)
    })
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })
})


describe('Contribution', function(done) {

  it('Should make sure the sale starts on this block', function(done) {
    let b = config.web3.eth.blockNumber;
    assert.isAtLeast(b, start_block, "Start block has not been reached")
    done();
  })

  it('Should contribute 0.1 eth from 8 accounts', function(done) {
    this.timeout(5000);
    Promise.resolve(accounts.slice(2, 10))
    .map((a) => {
      let unsigned = util.formUnsigned(a.address, sale, 0, amt)
      return util.sendTxPromise(unsigned, a.privateKey)
    })
    .then((txhash) => { done(); })
    .catch((err) => { assert.equal(err, null, err) })
  })

})

describe('Post-contribution', function(done) {
  it('Should make sure the sale is over', function(done) {
    let b = config.web3.eth.blockNumber;
    assert.isAtLeast(b, end_block, "It is not the end of the sale");
    done();
  })

  it('Should get the final sale price', function(done) {
    let Rf_data = "0xed2176c2";
    util.call(sale, Rf_data)
    .then((Rf) => {
      let expected_rf = Math.floor(Rmax/5) + Math.floor((NUM_TXN*Rmax)/50000);
      assert.equal(parseInt(Rf), expected_rf)
      done();
    })
  })

  it('Should claim GRID tokens', function(done) {
    this.timeout(5000)
    let rf;
    let Rf_data = "0xed2176c2";
    util.call(sale, Rf_data)
    .then((_rf) => {
      rf = parseInt(_rf);
      return Promise.resolve(accounts.slice(0, 10))
    })
    .map((a,i) => {
      let reward;
      let balance;
      let contribution;
      // Determine how much wei was contributed
      let cont_data = `0x26ca392b${util.zfill(a.address)}`
      return util.call(sale, cont_data)
      .then((_contribution) => {
        contribution = parseInt(_contribution);
        // Determine how many GRIDs should be awarded
        let reward_data = `0x57488064${util.zfill(a.address)}`
        return util.call(sale, reward_data)
      })
      .then((_reward) => {
        reward = parseInt(_reward);
        if (i < 2) {
          // Avoid any numerical errors by looking at multiples
          assert.equal(reward*100, contribution*rf*115, "Got wrong reward")
        } else {
          assert.equal(reward, contribution*rf, "Got wrong reward")
        }
        // Claim that reward
        let data = `0xf6761151${util.zfill(a.address)}`
        let unsigned = util.formUnsigned(a.address, sale, data, 0)
        return util.sendTxPromise(unsigned, a.privateKey)
      })
      .then((hash) => {
        let bal_data = `0x70a08231${util.zfill(a.address)}`
        return util.call(config.addresses.grid, bal_data)
      })
      .then((balance) => {
        assert.equal(balance, reward, "Did not receive GRIDs.");
        return;
      })
    })
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err) })
  })

  // it('Should get the last block number', function(done) {
  //   let b = config.web3.eth.blockNumber;
  //   assert.equal(b-start_block, 18, "Incorrect closing block number");
  //   done();
  // })

})
*/
