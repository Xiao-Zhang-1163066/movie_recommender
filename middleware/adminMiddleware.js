/**
 * Runs after protect, not instead of it.
 * protect = "is this a real logged-in user?" (authentication)
 * requireAdmin = "is that user allowed here?" (authorisation)
 *
 * Admin identity lives in an env var, not a `role` column — there is exactly
 * one admin, so a migration would be a lot of schema for one config line.
 * Move it into the schema if admins ever become plural.
 */
const requireAdmin = (req, res, next) => {
  const adminEmail = process.env.ADMIN_EMAIL;

  // Fail closed: "we don't know who the admin is" means nobody, not everybody.
  // Also stops `undefined === undefined` from accidentally granting access.
  if (!adminEmail) {
    console.error("ADMIN_EMAIL is not set — denying admin access.");
    return res.status(403).json({ status: "fail", message: "Forbidden" });
  }

  // Emails are case-insensitive in practice; a plain === locks the admin out
  // over one capital letter. req.user comes from protect's DB lookup, so it
  // can't be spoofed by the caller.
  const normalise = (value) => (value ?? "").trim().toLowerCase();

  if (normalise(req.user?.email) !== normalise(adminEmail)) {
    // Same opaque message as above, so a caller can't probe for the address.
    return res.status(403).json({ status: "fail", message: "Forbidden" });
  }

  next();
};

export { requireAdmin };
