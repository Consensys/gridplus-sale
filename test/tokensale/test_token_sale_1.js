// Test for token sale #1
// NOTE: This is meant to be run either in testrpc or on a node with instant-sealing
//       such that 1 transaction == 1 block
var assert = require('chai').assert;
var Promise = require('bluebird').Promise;
var config = require('../../config.js');
var ethutil = require('ethereumjs-util')
var util = require('../util.js');
var BigNumber = require('bignumber.js');

//====================================
// SALE VARIABLES
//====================================

let accounts = [];
let Rmax;
let start_block;
let sale = config.token_sale.one;
let amt = 9000000000000000 // The amount everyone will contribute


//====================================
// BLOCK TIMING constants
//====================================

// Number of total accounts
const N_ACCT = 6;

// Number of accounts designed to be excluded (i.e. fail to contribute)
// These always come AFTER the sale has ended (i.e. that is the souce of their failure)
const N_FAIL = 1;

// Number of presale participants
const N_PRESALE = 0;

// Each pre-saler gets white listed and then contributes
// This accounts for a total of two transactions/blocks per presaler
const START_WAIT = 2*N_PRESALE;

// Number of transactions to occur while the sale is underway
const NUM_TXN = N_ACCT - N_FAIL - N_PRESALE;

// Number of transactions after the end_block of the sale
const POST_SALE_TXN = 5;


//====================================
// TESTS
//====================================

describe('Setup', function(done) {
  it(`Should create ${N_ACCT} accounts`, function(done) {
    this.timeout(5000)
    util.createAccounts(N_ACCT)
    .then((_accounts) => {
      accounts = _accounts;
      assert.equal(accounts.length, 6);
      done();
    })
  })

  it('Should send a faucet request from each account', function(done) {
    this.timeout(5000);
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
      assert.equal(current_block, parseInt(start), "Sale does not start on this block.")
      start_block = parseInt(start);
      return util.call(sale, end_data)
    })
    .then((end) => {
      assert.equal(current_block+NUM_TXN, parseInt(end), "Sale end is the wrong block.");
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

describe('Contribute', function(done) {
  it('Should contribute 0.1 eth from 5 accounts', function(done) {
    Promise.resolve(accounts.slice(0, 5))
    .map((a) => {
      let unsigned = util.formUnsigned(a.address, sale, 0, amt)
      return util.sendTxPromise(unsigned, a.privateKey)
    })
    .then((txhash) => { done(); })
    .catch((err) => { assert.equal(err, null, err) })
  })

  it('Should fail at the 6th account', function(done) {
    let unsigned = util.formUnsigned(accounts[4].address, sale, 0, amt)
    util.sendTxPromise(unsigned, accounts[4].privateKey)
    .then((success) => { assert.equal(1, 0, 'Tx succeeded but should not have.'); done(); })
    .catch((err) => { assert.notEqual(err, null, 'Tx did not throw but should have.'); done(); })
  })

  it('Should make sure block number is correct', function(done) {
    let b = config.web3.eth.blockNumber;
    assert.equal(b, start_block+NUM_TXN+N_FAIL);
    done();
  })

})

describe('Post-contribution', function(done) {
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
    this.timeout(60000)
    let rf;
    let Rf_data = "0xed2176c2";
    util.call(sale, Rf_data)
    .then((_rf) => {
      rf = _rf;
      return Promise.resolve(accounts.slice(0, 5))
    })
    .map((a) => {
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
        assert.equal(reward, contribution*rf, "Got wrong reward")
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

  it('Should move ether to admins address', function(done) {
    let _balance = config.web3.eth.getBalance(config.setup.admin_addr);
    let _contract_bal = config.web3.eth.getBalance(sale);
    // let data = `0x19a36d3e${util.zfill(config.setup.admin_addr)}${util.zfill(transfer.toString(16))}`;
    let data = `0xd74f7b15${util.zfill(config.setup.admin_addr)}`;
    let unsigned = util.formUnsigned(config.setup.addr, sale, data, 0);
    util.sendTxPromise(unsigned, config.setup.pkey)
    .then((hash) => {
      let balance = config.web3.eth.getBalance(config.setup.admin_addr);
      let contract_bal = config.web3.eth.getBalance(sale).toNumber();
      assert.equal(true, balance.equals(_balance.plus(_contract_bal)), "Ether was not withdrawn from contract")
      assert.equal(contract_bal, 0, "Contract still has ether")
      done();
    })
  })
})

// Quick unit test of the GRID token
// https://github.com/ethereum/EIPs/issues/661
describe('Provable burn', function(done) {

  it('Should provably burn 10% of the first users tokens', function(done) {
    let a = accounts[0];
    let grid = config.addresses.grid;

    let _balance;
    let to_burn;
    let bal_data = `0x70a08231${util.zfill(a.address)}`;

    util.call(grid, bal_data)
    .then((__balance) => {
      _balance = parseInt(__balance);
      to_burn = 0.1*_balance;
      return util.getBurnMessage(to_burn, grid, a.address)
    })
    .then((msg) => {
      let sig = util.signMessage(msg, a.privateKey)
      // burn(bytes32[3],uint8,uint256)
      let data = `0xd7852acf${util.zfill(msg)}${util.zfill(sig.r)}${util.zfill(sig.s)}${util.zfill(sig.v)}${util.zfill(to_burn.toString(16))}`
      let unsigned = util.formUnsigned(a.address, grid, data, 0)
      return util.sendTxPromise(unsigned, a.privateKey)
    })
    .then((hash) => {
      return util.call(grid, bal_data)
    })
    .then((new_bal) => {
      assert.equal(parseInt(new_bal), _balance-to_burn)
      done();
    })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should provably burn 100% of the last users tokens', function(done) {
    let a = accounts[accounts.length-1];
    let grid = config.addresses.grid;

    let _balance;
    let to_burn;
    let bal_data = `0x70a08231${util.zfill(a.address)}`;

    util.call(grid, bal_data)
    .then((__balance) => {
      _balance = parseInt(__balance);
      to_burn = _balance;
      return util.getBurnMessage(to_burn, grid, a.address)
    })
    .then((msg) => {
      let sig = util.signMessage(msg, a.privateKey)
      // burn(bytes32[3],uint8,uint256)
      let data = `0xd7852acf${util.zfill(msg)}${util.zfill(sig.r)}${util.zfill(sig.s)}${util.zfill(sig.v)}${util.zfill(to_burn.toString(16))}`
      let unsigned = util.formUnsigned(a.address, grid, data, 0)
      return util.sendTxPromise(unsigned, a.privateKey)
    })
    .then((hash) => {
      return util.call(grid, bal_data)
    })
    .then((new_bal) => {
      assert.equal(parseInt(new_bal), _balance-to_burn)
      done();
    })
    .catch((err) => { assert.equal(err, null, err); })
  })

})


describe('Wrap-up', function(done) {
  it('Should make sure block number is correct', function(done) {
    let b = config.web3.eth.blockNumber;
    assert.equal(b, start_block+NUM_TXN+N_FAIL+POST_SALE_TXN+3); // Added ether withdrawal + burns
    done();
  })
})
