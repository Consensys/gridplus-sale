// Deploy GRID and run Token Sale Simulation #1
//
// Note that this simulation is intended to run on testrpc where each transaction
// is sealed into a separate block. Thus, calibrating the start and end blocks
// is a function of how many on-chain transactions will take place before and
// during each sale.
//
// NOTE: solcover runs random tests in the background which increases the block number
// This is highly annoying, but we can get around it by checking the block number
// against our expected blocknumber and having a "do something useless" function
// to fill the gap
var Promise = require('bluebird').Promise;
var ethutil = require('ethereumjs-util');
var config = require('../config.js');

var TokenSale = artifacts.require('./Sale.sol');
var GRID = artifacts.require('./GRID.sol');

var util = require('./util.js');

let channels;
let sale;
let grid_contract;
let grid_supply = '16000000000000000000000000'
let amt = 9000000000000000 // The amount everyone will contribute
let start_block;
let end_block;
let Rmax;
let rf;

//====================================
// BLOCK TIMING constants
//====================================

// Number of total accounts
const N_ACCT_1 = 6;
const N_ACCT_2 = 10;

// Number of accounts designed to be excluded (i.e. fail to contribute)
// These always come AFTER the sale has ended (i.e. that is the souce of their failure)
const N_FAIL_1 = 1;
const N_FAIL_2 = 0;

// Number of presale participants
const N_PRESALE_1 = 0;
const N_PRESALE_2 = 2;

// Block that the last participant partcipated on
let last_sale_block;


//====================================
// SIMLUATION 1
//====================================

contract('TokenSale', function(accounts) {
  let token;
  let grid_addr;

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

  it('Should deploy TokenSale contract and get its address', function() {
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

  it('Should switch the admin to accounts[1]', function(done) {
    sale.SwitchAdmin(accounts[1])
    .then(() => {
      return sale.admin()
    })
    .then((admin) => {
      assert.equal(admin, accounts[1])
      console.log('admin', admin, 'accounts[1]', accounts[1], accounts[0])
      done();
    })
  })

  let y_int_denom;
  let m_denom;

  it('Should setup the token sale simulation.', function(done) {
    // There are several tx that happen after setting this
    Rmax = 960;
    start_block = config.web3.eth.blockNumber + 4;
    let L = 15;
    let cap = 0.5 * Math.pow(10, 18);
    y_int_denom = 5;
    m_denom = 50000;
    sale.SetupSale(Rmax, cap, start_block, L, y_int_denom, m_denom, { from: accounts[1] })
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should fail to the token sale simulation a second time.', function(done) {
    // There are several tx that happen after setting this
    let Rmax_tmp = 9610;
    start_block = config.web3.eth.blockNumber + 3;
    let L = 15;
    let cap = 0.5 * Math.pow(10, 18);
    y_int_denom = 5;
    m_denom = 50000;
    sale.SetupSale(Rmax_tmp, cap, start_block, L, y_int_denom, m_denom, { from: accounts[1] })
    .then(() => { assert.equal(1, 0, "Should have failed"); })
    .catch((err) => { done(); })
  })

  it('Should make sure Rmax has not changed', function(done) {
    sale.Rmax()
    .then((rmax) => {
      assert.equal(rmax, 960, 'Rmax changed')
      done();
    })
    .catch((err) => { assert.equal(null, err, null); })
  })


  it('Should set the spot rate of the first sale', function(done) {
    let C = 200;
    sale.SetPrice(C, { from: accounts[1] })
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should fail to set the spot rate of the first sale a second time', function(done) {
    let C = 300;
    sale.SetPrice(C, { from: accounts[1] })
    .then(() => { assert.equal(1, 0, "Should have failed")})
    .catch((err) => { assert.notEqual(err, null); done(); })
  })

  it('Should get the starting block, ending block, and cap', function(done) {
    let current_block;
    let desired_block;
    sale.start()
    .then((start) => {
      current_block = config.web3.eth.blockNumber;
      desired_block = parseInt(start);
      // Make sure the chain is caught up
      let blocks_needed = desired_block - current_block;
      assert.isAtLeast(blocks_needed, 0, 'Uh oh, you need to set your start block higher.')
      return somethingUseless(blocks_needed)
    })
    .then(() => {
      current_block = config.web3.eth.blockNumber;
      assert.equal(current_block, desired_block, `Sale should begin on ${parseInt(desired_block)} but it is ${current_block} right now.`)
      return sale.end()
    })
    .then((end) => {
      end_block = parseInt(end)
      done()
    })
  })

  it('Should make sure the auction has enough GRID', function(done) {
    let current_block = config.web3.eth.blockNumber;
    grid_contract.balanceOf(sale.address)
    .then((balance) => {
      assert.equal(balance.toNumber(), grid_supply)
      done();
    })
  })

  it('Should contribute 0.1 eth from 5 accounts', function(done) {
    contribute(sale, accounts.slice(0, N_ACCT_1-N_FAIL_1))
    .then((txhash) => {
      last_sale_block = config.web3.eth.blockNumber;
      done();
    })
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
    let blocks_needed = end_block - b;
    assert.isAtLeast(blocks_needed, 0, 'Uh oh, too many blocks were inserted. Please increase sale length')
    somethingUseless(blocks_needed)
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should ensure the sale got the right amount of ether', function(done) {
    let eth = web3.eth.getBalance(sale.address);
    assert.equal(5*amt, eth.toNumber())
    done();
  })

  it('Should get the final sale price', function(done) {
    sale.Rf()
    .then((Rf) => {
      let elapsed = last_sale_block - start_block;
      let expected_rf = Math.floor(Rmax/y_int_denom) + Math.floor((elapsed*Rmax)/m_denom);
      assert.equal(parseInt(Rf), expected_rf)
      rf = parseInt(Rf);
      done();
    })
  })

  it('Should claim GRID tokens', function(done) {
    this.timeout(60000)
    Promise.resolve(accounts.slice(0, N_ACCT_1-N_FAIL_1))
    .map((a) => {
      return check(sale, a)
    })
    .then(() => { done(); })
  })

  it('Should make sure all GRID were withdrawn', function(done) {
    sale.wei_remaining()
    .then((wei) => {
      assert.equal(wei.toNumber(), 0, 'There is ether in the sale and should not be.')
      done();
    })
  })

  it('Should fail to withdraw reamining GRID by non-admin', function(done) {
    sale.MoveGRID(accounts[0])
    .then(() => { assert.equal(1, 0, "Should have failed"); })
    .catch((err) => { done(); })
  })

  it('Should withdraw remaining GRID', function(done) {
    sale.MoveGRID(accounts[0], { from: accounts[1] })
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should fail to withdraw ether by non-admin', function(done) {
    sale.MoveFunds(accounts[0])
    .then(() => { assert.equal(1, 0, "Should have failed"); })
    .catch((err) => { done(); })
  })

  it('Should withdraw ether', function(done) {
    sale.MoveFunds(accounts[0], { from: accounts[1] })
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })



  //====================================
  // SIMLUATION 2
  //====================================

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

  it('Should deploy TokenSale contract and get its address', function() {
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
    start_block = config.web3.eth.blockNumber + 10;
    let L = 50;
    let cap = 0.5 * Math.pow(10, 18);
    y_int_denom = 5;
    m_denom = 50000;
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

  it('Should get the starting block, ending block, and cap', function(done) {
    let current_block;
    let desired_block;
    sale.start()
    .then((start) => {
      current_block = config.web3.eth.blockNumber;
      desired_block = parseInt(start);
      // Make sure the chain is caught up
      let blocks_needed = desired_block - current_block;
      assert.isAtLeast(blocks_needed, 0, 'Uh oh, you need to set your start block higher.')
      return sale.end()
    })
    .then((end) => {
      end_block = parseInt(end)
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

  it('Should make sure no ether has been contributed', function(done) {
    sale.wei_remaining()
    .then((wei) => {
      assert.equal(wei.toNumber(), 0, 'There is ether in the sale and should not be.')
      done();
    })
  })

  it('Should whitelist accouts 1 and 2 to participate in the pre-sale', function(done) {
    Promise.resolve(accounts.slice(0, N_PRESALE_2))
    .map((a) => {
      whitelistPresale(sale, a)
    })
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  // it(`Should whitelist account ${N_ACCT+1} for the pre-sale`, function(done) {
  //
  // })

  it('Should make sure the sale has not started yet', function(done) {
    let b = config.web3.eth.blockNumber;
    assert.isAtMost(b+N_PRESALE_2, start_block);
    done();

  })

  it('Should let the presalers contribute', function(done) {
    contribute(sale, accounts.slice(0, N_PRESALE_2))
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })


  // Had to make sure pre-salers got in 1 block before the start, per Sale.sol
  it('Should run blocks up to the start block, beginning the regular sale', function(done) {
    let current_block = config.web3.eth.blockNumber;
    // Make sure the chain is caught up
    let blocks_needed = start_block - current_block;
    somethingUseless(blocks_needed)
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should make sure the sale starts this block', function(done) {
    let b = config.web3.eth.blockNumber;
    assert.equal(b, start_block, "Start block has not been reached")
    done();
  })

  it(`Should contribute 0.1 eth from ${N_ACCT_2-N_PRESALE_2} accounts`, function(done) {
    contribute(sale, accounts.slice(N_PRESALE_2, N_ACCT_2))
    .then((txhash) => {
      last_sale_block = config.web3.eth.blockNumber;
      done();
    })
    .catch((err) => { assert.equal(err, null, err) })
  })

  it('Should run blocks up to the start block, ending the regular sale', function(done) {
    let current_block = config.web3.eth.blockNumber;
    // Make sure the chain is caught up
    let blocks_needed = end_block - current_block;
    somethingUseless(blocks_needed)
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should make sure the sale starts this block', function(done) {
    let b = config.web3.eth.blockNumber;
    assert.equal(b, end_block, "Start block has not been reached")
    done();
  })

  it('Should get the final sale price', function(done) {
    sale.Rf()
    .then((Rf) => {
    let elapsed = last_sale_block - start_block;
      let expected_rf = Math.floor(Rmax/y_int_denom) + Math.floor((elapsed*Rmax)/m_denom);
      assert.equal(parseInt(Rf), expected_rf)
      rf = parseInt(Rf);
      done();
    })
  })

  it('Should make sure all ether has been contributed', function(done) {
    Promise.resolve(web3.eth.getBalance(sale.address))
    .then((wei) => {
      assert.equal(wei.toNumber(), N_ACCT_2*amt, 'Not enough ether contributed')
      done();
    })
  })

  it('Should claim GRID tokens for presalers', function(done) {
    this.timeout(60000)
    Promise.resolve(accounts.slice(0, N_PRESALE_2))
    .map((a) => {
      return check(sale, a, true)
    })
    .then(() => { done(); })
  })

  it('Should claim GRID tokens for regular sale', function(done) {
    this.timeout(60000)
    Promise.resolve(accounts.slice(N_PRESALE_2, N_ACCT_2))
    .map((a) => {
      return check(sale, a, false)
    })
    .then(() => { done(); })
  })

  it('Should make sure all GRID tokens have been claimed', function(done) {
    sale.wei_remaining()
    .then((wei) => {
      assert.equal(wei.toNumber(), 0, 'Someone has not claimed their GRID.')
      done();
    })
  })

  it('Should withdraw remaining GRID', function(done) {
    sale.MoveGRID(accounts[0])
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should withdraw ether', function(done) {
    sale.MoveFunds(accounts[0])
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })


  //====================================
  // SIMULATION 3
  //====================================
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

  it('Should deploy TokenSale contract and get its address', function() {
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
    start_block = config.web3.eth.blockNumber + 3;
    let L = 15;
    let cap = 0.5 * Math.pow(10, 18);
    y_int_denom = 5;
    m_denom = 50000;
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

  it('Should get the starting block, ending block, and cap', function(done) {
    let current_block;
    let desired_block;
    sale.start()
    .then((start) => {
      current_block = config.web3.eth.blockNumber;
      desired_block = parseInt(start);
      // Make sure the chain is caught up
      let blocks_needed = desired_block - current_block;
      assert.isAtLeast(blocks_needed, 0, 'Uh oh, you need to set your start block higher.')
      return somethingUseless(blocks_needed)
    })
    .then(() => {
      current_block = config.web3.eth.blockNumber;
      assert.equal(current_block, desired_block, `Sale should begin on ${parseInt(desired_block)} but it is ${current_block} right now.`)
      return sale.end()
    })
    .then((end) => {
      end_block = parseInt(end)
      done()
    })
  })

  it('Should make sure the auction has enough GRID', function(done) {
    let current_block = config.web3.eth.blockNumber;
    grid_contract.balanceOf(sale.address)
    .then((balance) => {
      assert.equal(balance.toNumber(), grid_supply)
      done();
    })
  })

  it('Should contribute 0.1 eth from 1 account', function(done) {
    contribute(sale, [accounts[0]])
    .then((txhash) => {
      last_sale_block = config.web3.eth.blockNumber;
      done();
    })
    .catch((err) => { assert.equal(err, null, err) })
  })

  it('Should open the escape hatch and end the sale', function(done) {
    sale.Escape()
    .then(() => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })

  it('Should make sure the sale has the right amount of ether', function(done) {
    let bal = web3.eth.getBalance(sale.address).toNumber();
    assert.equal(bal, amt, 'Sale has the wrong amount of ether')
    done();
  })

  let init_balance;
  it('Should get the balance of the contributor', function(done) {
    init_balance = web3.eth.getBalance(accounts[0])
    done();
  })

  it('Should fail to contribute', function(done) {
    contribute(sale, [accounts[1]])
    .then((txhash) => {
      assert.equal(1, 0, 'Should have failed to contribute')
    })
    .catch((err) => { assert.equal(1,1); done(); })
  })

  it('Should get a refund for the contributor', function(done) {
    sale.Abort(accounts[0])
    .then((txhash) => { done(); })
    .catch((err) => { assert.equal(err, null, err); })
  })
/*
  it('Should verify that there is no ether in the sale contract', function(done) {
    let sale_balance = web3.eth.getBalance(sale.address).toNumber();
    assert.equal(sale_balance, 0, 'Sale still has ether');
  })

  it('Should verify that the user was refunded', function(done) {
    let user_balance = web3.eth.getBalance(accounts[0]);
    assert.equal(init_balance.plus(amt), user_balance, 'User was not refunded')
  })
*/

  //====================================
  // UTILITY FUNCTIONS IN THE TRUFFLE SCOPE
  //====================================

  function whitelistPresale(sale, a) {
    return new Promise((resolve, reject) => {
      sale.WhitelistPresale(a)
      .then(() => {
        return sale.IsPresaler(a)
      })
      .then((is_presaler) => {
        assert.equal(is_presaler, true, `${a} is not whitelisted`)
        resolve(true);
      })
      .catch((err) => { reject(err); })
    })
  }

  function contribute(sale, accts) {
    return new Promise((resolve, reject) => {
      Promise.all(
        accts
        .map((a, i) => {
          let tx = { value: amt, from: a, to: sale.address };
          return Promise.resolve(web3.eth.sendTransaction(tx))
        })
      )
      .then(() => { resolve(true); })
      .catch((err) => { reject(err); })
    })
  }


  function check(sale, a, is_presaler) {
    return new Promise((resolve, reject) => {
      let reward;
      let balance;
      let contribution;
      sale.Contribution(a)
      .then((_contribution) => {
        contribution = _contribution.toNumber();
        // Determine how many GRIDs should be awarded
        return sale.Reward(a)
      })
      .then((_reward) => {
        reward = _reward.toNumber();
        let expected = is_presaler ? 1.15*contribution*rf : contribution*rf;
        assert.equal(reward, expected, "Got wrong reward")
        // Claim that reward
        return sale.Withdraw(a)
      })
      .then((hash) => {
        return grid_contract.balanceOf(a)
      })
      .then((balance) => {
        assert.equal(balance.toNumber(), reward, "Did not receive GRIDs.");
        return sale.Contribution(a)
      })
      .then((contribution2) => {
        assert.equal(contribution2, 0, 'Did not wash contribution number.')
        resolve(true);
      })
    })
  }

  function somethingUseless(n) {
    return new Promise((resolve, reject) => {
      let arr = Array.from(new Array(n),(val,index)=>index);
      Promise.all(
        arr
        .map((i) => {
          web3.eth.sendTransaction({ value: 1, from: accounts[0] })
        })
      )
      .then(() => { resolve(true); })
      .catch((err) => { reject(err); })
    })
  }

})
