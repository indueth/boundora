//! # Boundora hero account
//!
//! Deployed by the Boundora contract to `hero-N.<boundora>` when a hero's owner opens a
//! hero account. The hero's NEAR lives here, in its own NEAR account. Only the parent
//! Boundora contract can move it, and it only does so for the hero's current owner
//! (`claim_hero_vault`). Nobody holds a key to this account.

use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

/// NEAR kept back to pay for this account's own storage.
const STORAGE_BUFFER: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct HeroAccount {
    parent: AccountId,
    token_id: String,
}

#[near(serializers = [json])]
pub struct HeroAccountInfo {
    pub parent: AccountId,
    pub token_id: String,
    /// NEAR that can be withdrawn right now (balance minus storage reserve).
    pub available: U128,
}

#[near]
impl HeroAccount {
    /// Called once by the parent in the same batch that creates and deploys this account.
    #[init]
    pub fn new(token_id: String) -> Self {
        Self { parent: env::predecessor_account_id(), token_id }
    }

    /// Send NEAR out of the hero's account. Only the parent Boundora contract may call it.
    pub fn withdraw(&mut self, receiver_id: AccountId, amount: U128) -> Promise {
        require!(env::predecessor_account_id() == self.parent, "Only the Boundora contract can move this hero's NEAR");
        require!(amount.0 <= self.available(), "Not enough NEAR in the hero account");
        Promise::new(receiver_id).transfer(NearToken::from_yoctonear(amount.0))
    }

    pub fn info(&self) -> HeroAccountInfo {
        HeroAccountInfo { parent: self.parent.clone(), token_id: self.token_id.clone(), available: U128(self.available()) }
    }
}

impl HeroAccount {
    fn available(&self) -> u128 {
        let locked = env::storage_byte_cost().as_yoctonear() * env::storage_usage() as u128 + STORAGE_BUFFER;
        env::account_balance().as_yoctonear().saturating_sub(locked)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(who: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id("hero-7.boundora.testnet".parse().unwrap())
            .predecessor_account_id(who)
            .account_balance(NearToken::from_near(3))
            .storage_usage(2_000);
        b
    }

    #[test]
    fn parent_can_withdraw() {
        let parent: AccountId = "boundora.testnet".parse().unwrap();
        testing_env!(ctx(parent.clone()).build());
        let mut v = HeroAccount::new("hero-7".into());
        assert!(v.info().available.0 > NearToken::from_near(2).as_yoctonear());
        let _ = v.withdraw(accounts(1), U128(NearToken::from_near(1).as_yoctonear()));
    }

    #[test]
    #[should_panic(expected = "Only the Boundora contract")]
    fn nobody_else_can_withdraw() {
        testing_env!(ctx("boundora.testnet".parse().unwrap()).build());
        let mut v = HeroAccount::new("hero-7".into());
        testing_env!(ctx(accounts(1)).build());
        let _ = v.withdraw(accounts(1), U128(1));
    }

    #[test]
    #[should_panic(expected = "Not enough NEAR")]
    fn cannot_overdraw() {
        testing_env!(ctx("boundora.testnet".parse().unwrap()).build());
        let mut v = HeroAccount::new("hero-7".into());
        let _ = v.withdraw(accounts(1), U128(NearToken::from_near(3).as_yoctonear()));
    }
}
