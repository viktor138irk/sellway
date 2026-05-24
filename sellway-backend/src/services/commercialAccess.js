const { query } = require('../config/db');

const COMMERCIAL_ROLES = ['seller', 'freelancer', 'admin'];

function roleLabel(role) {
  if (role === 'freelancer') return 'freelancer';
  if (role === 'seller') return 'seller';
  return 'commercial account';
}

function expectedRoleForDelivery(deliveryType) {
  return deliveryType === 'service' ? 'freelancer' : 'seller';
}

function assertRoleCanUseDelivery(user, deliveryType) {
  if (!user) return 'Authentication required';
  if (user.role === 'admin') return null;
  const expected = expectedRoleForDelivery(deliveryType);
  if (user.role !== expected) {
    return deliveryType === 'service'
      ? 'Services can be published only from a freelancer account'
      : 'Products can be published only from a seller account';
  }
  return null;
}

async function getCommercialProfile(userId, client = { query }) {
  const { rows: [seller] } = await client.query(
    `SELECT s.*, u.role, u.username, u.email, u.status, u.email_verified, u.phone_verified, u.telegram_verified
     FROM sellers s
     JOIN users u ON u.id=s.user_id
     WHERE s.user_id=$1`,
    [userId]
  );
  return seller || null;
}

function describeCommercialAccess(user, seller, deliveryType = null) {
  if (!user) return { ok: false, code: 'auth_required', message: 'Authentication required' };
  if (user.role === 'admin') return { ok: true, code: 'admin', message: 'OK' };
  if (!COMMERCIAL_ROLES.includes(user.role)) {
    return { ok: false, code: 'role_required', message: 'Only approved sellers and freelancers can publish offers' };
  }
  if (deliveryType) {
    const roleError = assertRoleCanUseDelivery(user, deliveryType);
    if (roleError) return { ok: false, code: 'wrong_role', message: roleError };
  }
  if (!seller) {
    return { ok: false, code: 'profile_missing', message: 'Commercial profile is missing' };
  }
  if (!seller.commercial_terms_accepted_at) {
    return { ok: false, code: 'terms_required', message: 'Accept additional seller/freelancer terms before publishing' };
  }
  if (seller.commercial_application_status === 'rejected') {
    return {
      ok: false,
      code: 'rejected',
      message: seller.commercial_reject_reason || 'Commercial account was rejected by moderation',
    };
  }
  if (!seller.verified || seller.commercial_application_status !== 'approved') {
    return {
      ok: false,
      code: 'moderation_required',
      message: `${roleLabel(user.role)} account must be approved by moderation before publishing`,
    };
  }
  return { ok: true, code: 'approved', message: 'OK' };
}

async function assertCommercialAccess(user, deliveryType, client = { query }) {
  const roleError = assertRoleCanUseDelivery(user, deliveryType);
  if (roleError) return { ok: false, status: 403, error: roleError };
  if (user.role === 'admin') return { ok: true, seller: null };
  const seller = await getCommercialProfile(user.id, client);
  const access = describeCommercialAccess(user, seller, deliveryType);
  if (!access.ok) return { ok: false, status: 403, error: access.message, code: access.code, seller };
  return { ok: true, seller };
}

module.exports = {
  COMMERCIAL_ROLES,
  assertRoleCanUseDelivery,
  assertCommercialAccess,
  describeCommercialAccess,
  expectedRoleForDelivery,
  getCommercialProfile,
};
