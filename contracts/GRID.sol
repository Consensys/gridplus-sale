pragma solidity ^0.4.8;

import "./ERC20Plus.sol";

contract GRID is ERC20Plus {

  mapping(bytes32 => bool) played;
  mapping(address => uint) nonces;

  //============================================================================
  // ERC20
  //============================================================================

  mapping( address => uint ) balances;
  mapping( address => mapping( address => uint ) ) approvals;
  uint public supply;
  string public name;
  uint8 public decimals;
  string public symbol;
  string public version;

  function GRID( uint _supply, string _name, uint8 _decimals, string _symbol, string _version ) {
    balances[msg.sender] = _supply;
    supply = _supply;
    name = _name;
    decimals = _decimals;
    symbol = _symbol;
    version = _version;
  }

  function totalSupply() constant returns (uint) {
    return supply;
  }

  function balanceOf( address who ) constant returns (uint) {
    return balances[who];
  }

  function transfer( address to, uint value) returns (bool) {
    balances[msg.sender] = safeSub(balances[msg.sender], value);
    balances[to] = safeAdd(balances[to], value);
    Transfer( msg.sender, to, value );
    return true;
  }

  function transferFrom( address from, address to, uint value) returns (bool) {
    approvals[from][msg.sender] = safeSub(approvals[from][msg.sender], value);
    balances[from] = safeSub(balances[from], value);
    balances[to] = safeAdd(balances[to], value);
    Transfer( from, to, value );
    return true;
  }

  function approve(address spender, uint value) returns (bool) {
    approvals[msg.sender][spender] = value;
    Approval( msg.sender, spender, value );
    return true;
  }

  function allowance(address owner, address spender) constant returns (uint) {
    return approvals[owner][spender];
  }

  //============================================================================
  // ADDITIONAL FUNCTION
  //============================================================================

  function burn(bytes32[4] data, uint value) returns (bool) {
    // data[0]    hashed message
    // data[1]    r of signature
    // data[2]    s of signature
    // data[3]    v of signature

    // Keccak-256 hash of "burn(bytes32[4],uint256)"
    bytes4 word = 0x066bbd48;

    address signer = ecrecover(data[0], uint8(data[3]), data[1], data[2]);
    uint nonce = nonces[signer];

    // Make sure the hash provided is of the channel id and the amount sent
    bytes32 proof = sha3(sha3(uint(value)), bytes4(word), address(this), uint(nonce));

    // Ensure the proof matches, send the value, send the remainder, and delete the channel
    if (proof != data[0]) { return false; }
    if (played[proof] == true) { return false; }

    // Burn tokens
    balances[signer] = safeSub(balances[signer], value);
    supply = safeSub(supply, value);
    Transfer(signer, 0, value);

    // Update state variables
    played[proof] = true;
    nonces[signer] += 1;

    return true;
  }

  function getNonce(address user) constant returns (uint) {
    return nonces[user];
  }

  function tmp(uint value, address user) constant returns(bytes32) {
    bytes4 word = 0xf43e8cfd;
    uint nonce = nonces[user];
    return sha3(sha3(uint(value)), bytes4(word), address(this), uint(nonce));
  }


  //============================================================================
  // SAFE MATH FUNCTIONS
  //============================================================================

  function safeToAdd(uint a, uint b) internal returns (bool) {
    return (a + b >= a);
  }

  function safeAdd(uint a, uint b) internal returns (uint) {
    if (!safeToAdd(a, b)) throw;
    return a + b;
  }

  function safeToSubtract(uint a, uint b) internal returns (bool) {
    return (b <= a);
  }

  function safeSub(uint a, uint b) internal returns (uint) {
    if (!safeToSubtract(a, b)) throw;
    return a - b;
  }

  function() { throw; }
}
