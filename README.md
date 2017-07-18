# GridPlus Token Sale

This repo contains the contracts that will be deployed (`Sale.sol` and `GRID.sol`). The latter is a modified ERC20 token, which includes a function called `provable_redemption` that conforms to the [EIP661](https://github.com/ethereum/EIPs/issues/661) specification, which is a specific instance of the more abstract [EIP662](https://github.com/ethereum/EIPs/issues/662).

Three token sale simulations are included, which are run using `sol-coverage`. `Sale.sol` reaches 100% coverage and every line of `provable_redemption` is covered. The rest of `GRID.sol` is the normal ERC20 specification.

## Setup
This repo contains a series of simulations of the Grid+ token sale, which will be a discontinuous reverse Dutch auction.

To get set up, run the following:

```
npm install
bash testrpc.sh
```

And in a new terminal window, run:
```
npm run coverage
```

## What a simulation includes

The following is a walkthrough of the Grid+ token sale process.

### Summary

The Grid+ token sale will run in a discontinuous Reverse Dutch Auction. A fixed number of GRID tokens will be created and some subset of those will be transferred to the `Sale.sol` contract. The token sale is then parameterized, which can only happen once. At this point, pre-sale participants may start sending ether to the contract. Note that pre-salers are under contractual obligation to provide a pre-determined amount of ether and may be kicked out of the sale and blacklisted before their ether is returned. Once the starting block is reached, pre-sale participants may no longer participate and the crowd may send ether until the ending block is reached. Once the cap is reached, the final reward (a function of the blocks elapsed since the starting block) is calculated and applied to all participants. Anyone may withdraw all participants' GRID tokens (determined both by the final reward and the amount of ether contributed) once the sale is over. Note that pre-sale participants receive up to a 15% higher reward value (which still has a ceiling at Rmax).

### 1. Parameterization

The admin may parameterize the sale to fit the following curve:

```
R = (Rmax/a_1) + (Rmax * (bi-b0))/a_2
```

This curve describes `R`, the reward (in units of GRID/ETH) as a function of the blocks elapsed since the starting block, with `bi` being the current block and `b0` being the starting block. `a_1` and `a_2` are pre-determined parameters and `Rmax` is the reward value at which 100% of tokens are sold in this sale.

It is important to note that `R` cannot exceed `Rmax`.

`SetupSale()` may be called by the admin (by default, the address that deployed the contract). It takes the following parameters:

```
uint _Rmax    The maximum value of R (in GRID/ETH)
uint _start   The block number on which the sale begins
uint length   The number of blocks for which the sale will run. _start + length = end block
uint _a_1     The a_1 parameter in the function above
uint _a_2     The a_2 parameter in the function above
```

This function may only be called once by the admin and will `throw` otherwise.

### 2. Pre-sale

Pre-sale participants may be whitelisted at any time by the `admin` using `WhitelistPresale()`. This only takes one parameter:

```
address user    The address to allow into the Pre-sale
```

Pre-sale participants must deposit either 0 ether or the exact amount of ether they have pledged, per their individual pre-sale agreement. If this restriction is violated, Grid+ is contractually allowed to remove the pre-sale participant from the pre-sale (however, this participant is still allowed in the regular sale). The removal is done by calling `VentPresale()` by the `admin`, which also takes one parameter:

```
address user    The address to blacklist from the pre-sale. Any ether contributed is returned.
```

Whitelisted pre-sale participants may contribute to the pre-sale at any time before the starting block (`start`) has been reached. This is done by sending ether to the contract address (covered in the default function `function()`). Once `start` has elapsed, the pre-sale is over and `presale` addresses may no longer contribute.

### 3. Adding the cap

The cap may be added any time before the starting block. It may only be set once and must be set by the admin. `SetCap()` takes 1 parameter:

```
uint _cap    The sale cap in wei
```

This is a pre-requisite to the sale beginning.

### 3. Regular sale

Once `start` has been reached, the sale officially begins. Any Ethereum address may send ether to the sale via the default `function()`. This ether will be accepted *unless one of the following conditions is met*:

```
1. block.number > end block
2. The msg.value, when added to the contract balance, exceeds the cap
3. Address is in the pre-sale
4. The spot price has not been set
```

If none of these conditions are met, the contributor will trigger the following actions:

```
1. Record the amount of wei sent by the contributing address
2. Add msg.value to the total wei contributed
3. Calculate the reward of this block and update Rf (the final reward)
4. Emit an event capturing the contribution
```

###
