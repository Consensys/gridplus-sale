// Deploy GRID and run Token Sale Simulation #1
//
// Note that this simulation is intended to run on testrpc where each transaction
// is sealed into a separate block. Thus, calibrating the start and end blocks
// is a function of how many on-chain transactions will take place before and
// during each sale.
//
var Promise = require('bluebird').Promise;
var jsonfile = Promise.promisifyAll(require('jsonfile'));
var ethutil = require('ethereumjs-util');
var config = require('../config.js');

var TokenSale = artifacts.require('./Sale.sol');
var GRID = artifacts.require('./GRID.sol');

var util = require('./util.js');

let channels;
let initial_1_balance;
let sale;
let grid_contract;
let accounts = [];
let grid_supply = '16000000000000000000000000'
let amt = 9000000000000000 // The amount everyone will contribute
let start_block;
let Rmax;

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

contract('TokenSale', function(accounts) {
  let token;
  let grid_addr;

  it('Should send the admin a bunch of ether.', function() {
    var eth = 5*Math.pow(10, 18);
    var sendObj = { from: accounts[0], to: config.setup.admin_addr, value: eth }
    Promise.resolve(web3.eth.sendTransaction(sendObj))
    .then(function(txHash) {
      assert.notEqual(txHash, null);
      return Promise.delay(config.constants.block_time)
    })
    .then(() => {
      return web3.eth.getBalance(config.setup.admin_addr)
    })
    .then(function(balance) {
      assert.notEqual(0, parseInt(balance), "User still has a zero balance.")
      // get the net version
      var version = web3.version.network;
    })
  })

  it('Should deploy GRID and get its address', function() {
    return GRID.new(grid_supply, "GRID Token", 18, "GRID", "1")
    .then((instance) => {
      assert.notEqual(instance.address, null);
      grid_contract = instance;
      return instance.supply()
    })
    .then((supply) => {
      assert.equal(supply.toNumber(), grid_supply, "Wrong supply")
    })
  })

  it('Should check my GRID balance', function() {
    grid_contract.balanceOf(accounts[0])
    .then((balance) => {
      assert.equal(balance.toNumber(), grid_supply)
      tmp = balance;
    })
  })

  it('Should deploy TokenSale1 contract and get its address', function() {
    return TokenSale.new(grid_contract.address)
    .then(function(instance) {
      assert.notEqual(instance.address, null);
      sale = instance;
      return instance.GRID()
    })
    .then((_addr) => {
      assert.notEqual(_addr, "0x0000000000000000000000000000000000000000")
    })
  });

  it('Should send the token sale some GRID.', function(done) {
    grid_contract.transfer(sale.address, grid_supply)
    .then(() => {
      return grid_contract.balanceOf(sale.address);
    })
    .then((balance) => {
      assert.equal(balance.toNumber(), grid_supply);
      done();
    })
  })


  it('Should setup the token sale simulation.', function() {
    // There are several tx that happen after setting this
    Rmax = 960;
    start_block = config.web3.eth.blockNumber + N_ACCT + 3;
    let L = 5;
    let cap = 0.5 * Math.pow(10, 18);
    let y_int_denom = 5;
    let m_denom = 50000;
    sale.SetupSale(Rmax, cap, start_block, L, y_int_denom, m_denom)
  })

  it('Should set the spot rate of the first sale', function() {
    let C = 200;
    sale.SetPrice(C)
  })

  it('Should fail to set the spot rate of the first sale a second time', function() {
    let C = 300;
    sale.SetPrice(C)
    .then(() => {})
    .catch((err) => { assert.notEqual(err, null); })
  })

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
    let current_block = config.web3.eth.blockNumber;
    sale.start()
    .then((start) => {
      assert.equal(current_block, parseInt(start), `Sale should begin on ${parseInt(start)} but it is ${current_block} right now.`)
      return sale.end()
    })
    .then((end) => {
      assert.equal(current_block+NUM_TXN, parseInt(end), `Sale should begin on ${parseInt(end)}.`);
      done()
    })
  })

  it('Should make sure the auction has enough GRID', function(done) {
    grid_contract.balanceOf(sale.address)
    .then((balance) => {
      assert.equal(balance.toNumber(), grid_supply)
      done();
    })
  })

  it('Should contribute 0.1 eth from 5 accounts', function(done) {
    Promise.resolve(accounts.slice(0, 5))
    .map((a) => {
      let unsigned = util.formUnsigned(a.address, sale.address, 0, amt)
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
    assert.equal(b, start_block+NUM_TXN);
    done();
  })

  it('Should get the final sale price', function(done) {
    sale.Rf()
    .then((Rf) => {
      let expected_rf = Math.floor(Rmax/5) + Math.floor((NUM_TXN*Rmax)/50000);
      assert.equal(parseInt(Rf), expected_rf)
      done();
    })
  })

  let rf;
  it('Should get the final reward', function(done) {
    sale.Rf()
    .then((_rf) => { rf = _rf; done(); })
  })

  it('Should claim GRID tokens', function(done) {
    this.timeout(60000)

    Promise.all(
      accounts.slice(0, 5)
      .map((a) => {
        check(sale, a)
      })
    )
    .then(() => { done(); })

  })


  function check(sale, a) {
    return new Promise((resolve, reject) => {
      let reward;
      let balance;
      let contribution;
      sale.Contribution(a.address)
      .then((_contribution) => {
        contribution = _contribution.toNumber();
        // Determine how many GRIDs should be awarded
        return sale.Reward(a.address)
      })
      .then((_reward) => {
        reward = _reward.toNumber();
        assert.equal(reward, contribution*rf, "Got wrong reward")
        // Claim that reward
        let data = `0xf6761151${util.zfill(a.address)}`
        let unsigned = util.formUnsigned(a.address, sale.address, data, 0)
        return util.sendTxPromise(unsigned, a.privateKey)
      })
      .then((hash) => {
        return grid_contract.balanceOf(a.address)
      })
      .then((balance) => {
        assert.equal(balance, reward, "Did not receive GRIDs.");
        return;
      })
    })
  }


})
