var data = require('./data.json');

exports.setup = {
  pkey: '8e928c90ecf0df421a510fef224698f81356c6d157efb8dfd46209025b0916f3',
  addr: '0xed6e14a6d2ef654f4dae69192f2e0ef767050619',
  admin_addr: '0x26f47dd9bb4bc161fb257e9b71ecac47b429ac09',
  admin_pkey: 'aebd776050b40ec7f622262d7ed9a43bf3ebf02c82053b8e252c5835514bcf92'
}

exports.constants = {
  block_time: 1500
}

exports.token_sale = {
  one: data.token_sale_1,
  two: data.token_sale_2,
  three: data.token_sale_3,
}

exports.addresses = {
  grid: data.grid_addr,
}

var web3 = require('web3');
var web3_provider = 'http://localhost';
var web3_port = '8545';
var _web3 = new web3();
_web3.setProvider(new web3.providers.HttpProvider(`${web3_provider}:${web3_port}`));
exports.web3 = _web3;
