module.exports = {
  networks: {
    development: {
      gas: 0xfffffff,
      host: "localhost",
      port: 8545,
      network_id: "*", // Match any network id
      gasPrice: 0x01
    },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8545,
      gas: 0xffffffff,
      gasPrice: 0x01
    }
  }
};
