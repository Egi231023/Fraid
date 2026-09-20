// Preserve verification redirects without logging authentication fragments.
const target = new URL('./v2/', location.href);
target.search = location.search;
target.hash = location.hash;
location.replace(target.href);
