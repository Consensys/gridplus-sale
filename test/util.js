var Promise = require('bluebird').Promise;
var config = require('../config.js');
var Tx = require('ethereumjs-tx');
var fs = require('fs');
var ethutil = require('ethereumjs-util');
var keystore = require('eth-lightwallet').keystore;
let gasPrice = 2*Math.pow(10, 9)

// Form an unsigned tx. Returns an object.
function formUnsigned(from, to, data, _value, _gas) {
  let nonce = config.web3.eth.getTransactionCount(from)
  let value = _value || 0
  let gas = _gas || 100000
  let tx = {
    from: from,
    to: to,
    data: data,
    value: `0x${value.toString(16)}`,
    gas: `0x${gas.toString(16)}`,
    gasPrice: `0x${gasPrice.toString(16)}`
  };
  return tx;
}
exports.formUnsigned = formUnsigned;

// Call a web3 contract. Returns a hex string.
exports.call = function(to, data) {
  return new Promise((resolve, reject) => {
    config.web3.eth.call({to: to, data: data}, (err, result) => {
      if (err) { reject(err); }
      else { resolve(result); }
    })
  })
}

// Sign a transaction
exports.sign = function(txn, pkey) {
  var privateKey = new Buffer(pkey, 'hex')
  var tx = new Tx(txn);
  tx.sign(privateKey);
  var serializedTx = tx.serialize();
  return serializedTx.toString('hex');
}

// Sign a message
exports.ecsign = function(msg_hash, pkey) {
  var privateKey = new Buffer(pkey, 'hex');
  var signed = ethutil.ecsign(msg_hash, privateKey);
  return signed
}

// Send a transaction (promisified)
function sendTxPromise(txn, pkey) {
  return new Promise((resolve, reject) => {
    var privateKey = new Buffer(pkey, 'hex')
    var tx = new Tx(txn);
    tx.sign(privateKey);
    var serializedTx = tx.serialize();
    var txHash = config.web3.eth.sendRawTransaction(serializedTx.toString('hex'));
    resolve(txHash)
  })
}
exports.sendTxPromise = sendTxPromise;

// Left pad and remove 0x prefix
exports.zfill = function(num) { if (num.substr(0,2)=='0x') num = num.substr(2, num.length); var s = num+""; while (s.length < 64) s = "0" + s; return s; }

// Create `num` accounts and return an array of objects.
exports.createAccounts = function(num) {
  return new Promise((resolve, reject) => {
    let accounts = [];
    accounts.length = num;
    return Promise.resolve(accounts)
    .map((account, i) => { return createKeystore('test') })
    .map((ks, i) => { accounts[i] = ks; })
    .then(() => { resolve(accounts); })
    .catch((err) => { reject(err); })
  })
}

// Create a single keystore object given a password.
function createKeystore(_password) {
  return new Promise(function(resolve, reject) {
    var password = Buffer(_password).toString('hex');
    keystore.createVault({ password: password }, function(error, ks) {
      if (error) { reject(error); }
      ks.keyFromPassword(password, function(error, dKey) {
        if (error) { reject(error); }
        ks.generateNewAddress(dKey, 1);
        var address = `0x${ks.getAddresses()[0]}`;
        var privateKey = ks.exportPrivateKey(address, dKey);
        var keystore = JSON.parse(ks.serialize());
        resolve({ address, privateKey, keystore });
      });
    });
  });
}

// Given a set of accounts, call the faucet for each and get 5 eth
exports.FaucetAccounts = function(accounts, _amt) {
  return new Promise((resolve, reject) => {
    let from = config.setup.addr;
    let pkey = config.setup.pkey;
    let amt = _amt || 0.1;
    Promise.resolve(accounts)
    .map((a) => { return callFaucet(a.address, from, pkey, amt)})
    .then(() => { resolve(true); })
    .catch((err) => { reject(err); })
  })
}

// Have the admin (whose pkey is passed) ether to the address provided.
// amt is in ether
function callFaucet(to, from, pkey, amt) {
  return new Promise((resolve, reject) => {
    let unsigned = formUnsigned(from, to, 0, amt*Math.pow(10, 18))
    return sendTxPromise(unsigned, pkey)
    .then((hash) => { resolve(hash); })
    .catch((err) => { reject(err); })
  })
}
