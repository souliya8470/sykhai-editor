// (stub — replaced by the full AI module)
function loadKeys() { try { return JSON.parse(localStorage.getItem('sk_keys') || '{}'); } catch (e) { return {}; } }
function saveKeys(k) { localStorage.setItem('sk_keys', JSON.stringify(k)); }
function loadCap() { return parseFloat(localStorage.getItem('sk_cap') || '50'); }
function updateCostBadge() { }
