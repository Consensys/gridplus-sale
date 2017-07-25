// Token sale contract
pragma solidity ^0.4.11;
import "./ERC20.sol";

contract Sale {

  event _Presale(address indexed user, uint value, uint time);
  event _Sale(address indexed user, uint value, uint time);
  event _Boot(address indexed user, uint time);
  event _Withdraw(address indexed user, uint value, uint time);

  address public admin;
  address public GRID;
  mapping (address => uint) wei_sent;      // Amounts of wei sent
  mapping (address => bool) presale;       // Whitelisted presale participants
  uint public wei_remaining;               // Amount of wei belonging to participants who have not received GRID
  uint public start;                       // Starting block
  uint public end;                         // Ending block
  uint public cap;                         // Cap in wei
  uint public Rmax;                        // Maximum reward (qGRID/WEI), multiple of 5
  uint public Rf;                          // Final reward (qGRID/WEI)
  bool private hatch_open;                 // Escape hatch

  uint public a_2;                     // denominator of slope (should be 50,000)
  uint public a_1;                 // denominator of y-intercept (should be 5)

  //============================================================================
  // PUBLIC SALE
  //============================================================================

  // The token sale
  function() payable {
    if (hatch_open == true) {
      throw;
    } else if (
      block.number < start
      && presale[msg.sender] == true
    ) {
      // For whitelisted pre-sale participants
      wei_sent[msg.sender] = safeAdd(wei_sent[msg.sender], msg.value);
      wei_remaining = safeAdd(wei_remaining, msg.value);
      _Presale(msg.sender, msg.value, now);
    } else if (
      block.number >= start && block.number <= end
      && msg.value + address(this).balance <= cap
      && presale[msg.sender] == false  // pre-salers cannot participate in the regular sale
      && cap > 0
    ) {
      wei_sent[msg.sender] = safeAdd(wei_sent[msg.sender], msg.value);
      wei_remaining = safeAdd(wei_remaining, msg.value);
      // Update the price
      uint r = CalcReward();
      if (r > Rmax) { r = Rmax; }
      Rf = r;
      _Sale(msg.sender, msg.value, now);
    } else { throw; }
  }

  // Once the auction is over, contributors may withdraw their tokens.
  // Anyone may distribute tokens to any participant.
  function Withdraw(address user) {
    if (wei_sent[user] == 0) { throw; }
    else if (address(this).balance < cap && end > block.number) { throw; }
    else {
      uint amt = GetUserReward(user);
      wei_remaining = safeSub(wei_remaining, wei_sent[user]);
      wei_sent[user] = 0;

      // Instantiate the grid token and transfer
      ERC20 grid = ERC20(GRID);
      if (!grid.transfer(user, amt)) { throw; }
      _Withdraw(user, amt, now);
    }
  }

  function GetUserReward(address user) returns (uint) {
    // Calculate the amount of GRID to send the contributor
    uint contribution = wei_sent[user];

    // Make sure we don't go over the max reward
    uint max_reward = Rmax*contribution;

    if (presale[user] == true) {
      // Presalers get up to 15% more tokens
      uint _amt = safeMul(safeMul(contribution, Rf), uint(115));
      uint amt = safeDiv(_amt, uint(100));
      if (amt > max_reward) { return max_reward; }
      else { return amt; }

    } else {
      // Normal partipants get the contribution times Rf
      return safeMul(contribution, Rf);
    }
  }


  // Once the sale has started, calculate the price
  // Price is in GRID/wei
  // Where qGRID is the atomic unit of GRID (1 GRID = 10*18 qGRID)
  function CalcReward() private returns (uint) {
    if (block.number < start || block.number > end) { throw; }
    else {
      //R = (Rmax/5)  + (Rmax * (Bi - B0))/50,000
      uint y_int = safeDiv(Rmax, a_1);

      uint d_block = safeSub(block.number, start);
      // 0.0005 eth == 50000000000000 wei
      uint _m = safeMul(Rmax, d_block);
      uint m = safeDiv(_m, a_2);
      return safeAdd(y_int, m);
    }
  }

  //============================================================================
  // PRE-SALE
  //============================================================================

  // Whitelist an address to participate in the presale
  function WhitelistPresale(address user) onlyAdmin() {
    presale[user] = true;
  }

  // If we want to kick a presaler out for some reason
  function VentPresale(address user) onlyAdmin() payable {
    uint amount = wei_sent[user];
    if (amount > 0) {
      wei_sent[user] = 0;
      wei_remaining = safeSub(wei_remaining, amount);
      user.transfer(amount);
      //user.transfer(10000000000);
      presale[user] = false;
      _Boot(user, now);
    }
  }

  //============================================================================
  // SAFE MATH
  //============================================================================

  function safeAdd(uint256 a, uint256 b) internal returns (uint256) {
    uint256 c = a + b;
    assert(c >= a);
    return c;
  }

  function safeSub(uint256 a, uint256 b) internal returns (uint256) {
    assert(b <= a);
    return a - b;
  }

  function safeMul(uint256 a, uint256 b) internal returns (uint256) {
    uint256 c = a * b;
    assert(a == 0 || c / a == b);
    return c;
  }

  function safeDiv(uint256 a, uint256 b) internal returns (uint256) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    uint256 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return c;
  }


  modifier onlyAdmin() {
    if (msg.sender != admin) { throw; }
    _;
  }


  //============================================================================
  // ADMIN
  //============================================================================

  // Instantiate the Auction contract with GRID and BOLT addresses.
  function Sale(address _GRID) {
    admin = msg.sender;
    GRID = _GRID;
    hatch_open = false;
  }

  // Parameterize the sale
  function SetupSale(uint _start, uint length, uint _a_1, uint _a_2) onlyAdmin() {
    // Can only do this once
    if (start == 0) {
      a_1 = _a_1;
      a_2 = _a_2;
      start = _start;
      end = length + _start;
      wei_remaining = 0;
    } else {
      throw;
    }
  }

  // Set the cap (in wei)
  function SetCap(uint _cap, uint _Rmax) onlyAdmin() {
    if (cap > 0) { throw; }
    cap = _cap;
    Rmax = _Rmax;  // This needs to be a multiple of 5
  }

  // GRID may only be moved once the sale is over amd all GRID have been
  // withdrawn by participants
  function MoveGRID(address to) onlyAdmin() {
    if (block.number > end && start > 0 && wei_remaining == 0) {
      ERC20 grid = ERC20(GRID);
      uint balance = grid.balanceOf(address(this));
      if (!grid.transfer(to, balance)) { throw; }
    } else {
      throw;
    }
  }

  // Ether may only be moved once all GRID have been withdrawn.
  // This includes the amount of GRID moved by Grid+.
  function MoveFunds(address to) onlyAdmin() {
    to.transfer(address(this).balance);
  }

  function SwitchAdmin(address new_admin) onlyAdmin() {
    admin = new_admin;
  }

  //============================================================================
  // GETTERS
  //============================================================================

  // Get how much wei a user contributed
  function Contribution(address user) public constant returns (uint) {
    return wei_sent[user];
  }

  // Determine how many GRID will be rewarded.
  function Reward(address user) public constant returns (uint) {
    uint amt = GetUserReward(user);
    return amt;
  }

  function IsPresaler(address user) public constant returns (bool) {
    return presale[user];
  }

  //============================================================================
  // EMERGENCY
  //============================================================================

  // Open or close the escape hatch
  function Escape() onlyAdmin() {
    hatch_open = true;
  }

  // User may withdraw ether sent to the contract at any time if the hatch is open.
  function Abort(address user) {
    if (hatch_open == false) { throw; }
    else {
      uint to_refund = wei_sent[user];
      wei_sent[user] = 0;
      user.transfer(to_refund);
    }
  }


}
