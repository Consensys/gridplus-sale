var TokenSale = artifacts.require('./Sale.sol');
var GRID = artifacts.require('./GRID.sol');

var supply = 200 * Math.pow(10, 24)

module.exports = function(deployer) {
  deployer.deploy(TokenSale);
  deployer.deploy(GRID, supply, "GRID Token", 18, "GRID", "1")
};
