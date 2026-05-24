function referralRequirements(user) {
  const full = process.env.REFERRAL_REQUIRE_FULL_VERIFICATION !== 'false';
  return {
    email: Boolean(user?.email_verified),
    phone: Boolean(user?.phone_verified),
    telegram: Boolean(user?.telegram_verified),
    full,
  };
}

function canUseReferralProgram(user) {
  const req = referralRequirements(user);
  return req.full ? req.email && req.phone && req.telegram : req.email;
}

module.exports = { canUseReferralProgram, referralRequirements };
