// Get tenant slug from subdomain
export const getTenantSlug = () => {
  const hostname = window.location.hostname;

  // localhost hoặc IP -> dùng default tenant
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return 'hoangnamaudio'; // Default cho development
  }

  // Vercel default domain (xxx.vercel.app) -> dùng default tenant
  if (hostname.endsWith('.vercel.app')) {
    return 'hoangnamaudio';
  }

  // Custom domain với subdomain
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const subdomain = parts[0];

    // Bỏ qua www
    if (subdomain === 'www') {
      return 'hoangnamaudio';
    }

    // Map các subdomain về tenant tương ứng
    const subdomainMap = {
      'in': 'hoangnamaudio',
      'app': 'hoangnamaudio',
      'manage': 'hoangnamaudio',
      'erp': 'hoangnamaudio',
    };

    return subdomainMap[subdomain] || subdomain;
  }

  // domain.com without subdomain -> default
  return 'hoangnamaudio';
};
