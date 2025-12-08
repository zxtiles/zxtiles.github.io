// Service Worker 配置 - 简化版本，避免未处理的 Promise 错误
const VERSION = '0.2.118';
const CACHE_NAME = `zx-tiles-v${VERSION}`;
const IMAGE_CACHE = `zx-tiles-images-v${VERSION}`;

// 安装 Service Worker
self.addEventListener('install', (event) => {
	console.log('Service Worker: Installing...');
	self.skipWaiting();
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
	console.log('Service Worker: Activating...');
	
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames
					.filter(name => !name.includes(`v${VERSION}`))
					.map(name => {
						console.log('Service Worker: Deleting old cache:', name);
						return caches.delete(name);
					})
			);
		})
	);
	
	return self.clients.claim();
});

// 拦截请求 - 使用简单的 stale-while-revalidate 策略
self.addEventListener('fetch', (event) => {
	const { request } = event;
	
	// 只处理 GET 请求
	if (request.method !== 'GET') return;
	
	// 解析 URL
	let url;
	try {
		url = new URL(request.url);
	} catch (e) {
		return;
	}
	
	// 只处理同源请求
	if (url.origin !== location.origin) return;
	
	// 图片请求 - Cache First
	if (request.url.match(/\.(webp|jpg|jpeg|png|gif|svg|ico)$/i)) {
		event.respondWith(handleImageRequest(request));
		return;
	}
	
	// JS/CSS 请求 - Cache First
	if (request.url.match(/\.(js|css|woff|woff2)$/i)) {
		event.respondWith(handleStaticRequest(request));
		return;
	}
	
	// HTML/其他请求 - Network First
	event.respondWith(handleNavigationRequest(request));
});

// 处理图片请求
async function handleImageRequest(request) {
	try {
		const cache = await caches.open(IMAGE_CACHE);
		const cached = await cache.match(request);
		
		if (cached) {
			return cached;
		}
		
		const response = await fetch(request);
		if (response.ok) {
			cache.put(request, response.clone()).catch(() => {});
		}
		return response;
	} catch (error) {
		// 尝试返回缓存
		const cached = await caches.match(request);
		if (cached) return cached;
		
		// 返回透明 1x1 像素图片作为后备
		return new Response(
			'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
			{ 
				status: 200, 
				headers: { 'Content-Type': 'image/gif' }
			}
		);
	}
}

// 处理静态资源请求
async function handleStaticRequest(request) {
	try {
		const cache = await caches.open(CACHE_NAME);
		const cached = await cache.match(request);
		
		if (cached) {
			return cached;
		}
		
		const response = await fetch(request);
		if (response.ok) {
			cache.put(request, response.clone()).catch(() => {});
		}
		return response;
	} catch (error) {
		const cached = await caches.match(request);
		if (cached) return cached;
		return new Response('', { status: 503 });
	}
}

// 处理导航请求
async function handleNavigationRequest(request) {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone()).catch(() => {});
		}
		return response;
	} catch (error) {
		const cached = await caches.match(request);
		if (cached) return cached;
		
		// 尝试返回首页
		const homeCache = await caches.match('/');
		if (homeCache) return homeCache;
		
		return new Response('<html><body><h1>Offline</h1></body></html>', {
			status: 503,
			headers: { 'Content-Type': 'text/html' }
		});
	}
}

// 监听消息
self.addEventListener('message', (event) => {
	if (event.data === 'skipWaiting') {
		self.skipWaiting();
	}
	if (event.data === 'clearCache') {
		caches.keys().then(names => 
			Promise.all(names.map(name => caches.delete(name)))
		);
	}
});
