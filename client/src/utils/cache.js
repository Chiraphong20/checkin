// Cache utility for storing frequently accessed data
const CACHE_PREFIX = 'checkin_app_';
const CACHE_EXPIRY = {
  BRANCHES: 24 * 60 * 60 * 1000, // 24 hours
  EMPLOYEES: 30 * 60 * 1000, // 30 minutes
  HOLIDAYS: 24 * 60 * 60 * 1000, // 24 hours
  SETTINGS: 60 * 60 * 1000, // 1 hour
};

export const cache = {
  set(key, data, expiry = null) {
    try {
      const item = {
        data,
        timestamp: Date.now(),
        expiry: expiry || CACHE_EXPIRY[key] || 60 * 60 * 1000, // default 1 hour
      };
      localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(item));
    } catch (error) {
      console.warn('Cache set error:', error);
    }
  },

  get(key) {
    try {
      const itemStr = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!itemStr) return null;

      const item = JSON.parse(itemStr);
      const now = Date.now();
      
      if (now - item.timestamp > item.expiry) {
        localStorage.removeItem(`${CACHE_PREFIX}${key}`);
        return null;
      }

      return item.data;
    } catch (error) {
      console.warn('Cache get error:', error);
      return null;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    } catch (error) {
      console.warn('Cache remove error:', error);
    }
  },

  clear() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Cache clear error:', error);
    }
  },
};

