/**
Deploy the payment channels contract and test them out
*/
var Promise = require('bluebird').Promise;
var jsonfile = Promise.promisifyAll(require('jsonfile'));
var ethutil = require('ethereumjs-util');
var config = require('../config.js');

var TokenSale = artifacts.require('./Sale.sol');
var GRID = artifacts.require('./GRID.sol');

let fdata = `${process.cwd()}/data.json`;
var config = require('../config.js');
var util = require('./util.js');

// Preload existing data file and edit it here
let data = require(fdata);

let channels;
let initial_1_balance;
let token_sales = [];
let grid_contract;

contract('TokenSale', function(accounts) {
  let token;
  let grid_addr;

  it('Should send the admin a bunch of ether.', function() {
    var eth = 10*Math.pow(10, 18);
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

  let grid_supply = 160000000*Math.pow(10, 18)

  it('Should deploy GRID and get its address', function() {
    let n = 10*grid_supply;
    return GRID.new(n, "GRID Token", 18, "GRID", "1")
    .then((instance) => {
      assert.notEqual(instance.address, null);
      grid_contract = instance;
      grid_addr = instance.address;
      data.grid_addr = grid_addr;
      return instance.supply()
    })
    .then((supply) => {
      assert.equal(supply.toNumber(), n, "Wrong supply")
    })
  })

  it('Should check my GRID balance', function() {
    grid_contract.balanceOf(accounts[0])
    .then((balance) => {
      assert.equal(balance.toNumber(), 10*grid_supply)
    })
  })

  it('Should deploy TokenSale1 contract and get its address', function() {
    return TokenSale.new(data.grid_addr)
    .then(function(instance) {
      assert.notEqual(instance.address, null);
      token_sales.push(instance);
      data.token_sale_1 = instance.address;
      return instance.GRID()
    })
    .then((_addr) => {
      assert.notEqual(_addr, "0x0000000000000000000000000000000000000000")
    })
  });

  it('Should send the token sale some GRID.', function() {
    grid_contract.transfer(data.token_sale_1, grid_supply)
    .then(() => {})
  })

  it('Should deploy TokenSale2 contract and get its address', function() {
    return TokenSale.new(data.grid_addr)
    .then(function(instance) {
      assert.notEqual(instance.address, null);
      token_sales.push(instance);
      data.token_sale_2 = instance.address;
    })
  });

  it('Should check my GRID balance', function() {
    grid_contract.balanceOf(accounts[0])
    .then((balance) => {
      assert.isAtLeast(balance.toNumber(), grid_supply)
    })
  })


  it('Should send the token sale some GRID.', function() {
    grid_contract.transfer(data.token_sale_2, grid_supply, { from: accounts[0] })
    .then(() => {})

  })

  it('Should deploy TokenSale3 contract and get its address', function() {
    return TokenSale.new(data.grid_addr)
    .then(function(instance) {
      assert.notEqual(instance.address, null);
      token_sales.push(instance);
      data.token_sale_3 = instance.address;
    })
  });

  it('Should setup the first token sale simulation.', function() {
    // There are several tx that happen after setting this
    let Rmax = 960;
    let start = config.web3.eth.blockNumber + 9;
    let L = 5;
    let cap = 0.5 * Math.pow(10, 18)
    token_sales[0].SetupSale(Rmax, cap, start, L)
  })

  it('Should setup the second token sale simulation.', function() {
    // There are several tx that happen after setting this
    let Rmax = 960;
    let start = config.web3.eth.blockNumber + 33;
    let L = 8;
    let cap = 0.5 * Math.pow(10, 18)
    token_sales[1].SetupSale(Rmax, cap, start, L)
  })

  it('Should switch admin for sale', function() {
    token_sales[1].SwitchAdmin(config.setup.admin_addr)
    .then(() => {})
  })

  it('Should save data.json', function() {
    jsonfile.writeFileAsync(fdata, data, { spaces: 2 })
  })

})
