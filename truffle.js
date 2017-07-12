module.exports = {
  networks: {
    development: {
      gas: 0xfffffff,
      host: "localhost",
      port: 8545,
      network_id: "*" // Match any network id
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01 
    }
  }
};
