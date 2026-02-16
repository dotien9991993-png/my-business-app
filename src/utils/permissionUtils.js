/**
 * Check if a user has Admin role (case-insensitive)
 * @param {object} user - User object with role property
 * @returns {boolean}
 */
export const isAdmin = (user) => user?.role === 'Admin' || user?.role === 'admin';
