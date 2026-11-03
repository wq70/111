// Public music services used by the Together Listening player.
// The browser talks directly to public HTTPS endpoints; no user-side server is required.
(function () {
  'use strict';

  const PLACEHOLDER_COVER = 'https://s3plus.meituan.net/opapisdk/op_ticket_885190757_1757748720126_qdqqd_1jt5sv.jpeg';
  const REQUEST_TIMEOUT = 8000;
  const SESSION_KEY = 'music_netease_public_session';
  const NETEASE_LOGIN_NODE = 'https://netease-cloud-music-api.th911.dpdns.org';
  const NETEASE_SESSION_NODES = new Set([NETEASE_LOGIN_NODE, 'https://ncm-api.vercel.app']);
  const METING_NODES = {
    primary: 'https://api.kfjie.me/music',
    neteaseFallback: 'https://meting.mikus.ink/api'
  };

  function withHttps(value) {
    return typeof value === 'string' ? value.replace(/^http:\/\//i, 'https://') : value;
  }

  async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url, options) {
    const response = await fetchWithTimeout(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function fetchText(url) {
    const response = await fetchWithTimeout(withHttps(url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  function endpoint(base, params) {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  function extractMetingId(value) {
    try {
      return new URL(value).searchParams.get('id') || '';
    } catch (_) {
      return '';
    }
  }

  function mapMetingSong(song, platform, provider) {
    const playUrl = withHttps(song.url || '');
    return {
      name: song.title || song.name || '未知歌曲',
      artist: song.author || song.artist || '未知歌手',
      id: String(song.id || extractMetingId(playUrl) || ''),
      cover: withHttps(song.pic || song.cover || PLACEHOLDER_COVER),
      source: platform,
      provider,
      playUrl,
      lyricUrl: withHttps(song.lrc || ''),
      duration: Number(song.duration || song.time || 0) || 0
    };
  }

  async function searchMeting(base, platform, query, provider, limit = 30) {
    const data = await fetchJson(endpoint(base, {
      server: platform,
      type: 'search',
      id: query,
      limit
    }));
    if (!Array.isArray(data)) return [];
    return data.slice(0, limit).map(song => mapMetingSong(song, platform, provider));
  }

  async function searchVKeysTencent(query, limit = 30) {
    const result = await fetchJson(endpoint('https://api.vkeys.cn/v2/music/tencent', { word: query }));
    if (result?.code !== 200 || !Array.isArray(result.data)) return [];
    return result.data.slice(0, limit).map(song => ({
      name: song.song || song.name || '未知歌曲',
      artist: song.singer || '未知歌手',
      id: String(song.id || song.mid || ''),
      mid: song.mid || '',
      cover: withHttps(song.cover || PLACEHOLDER_COVER),
      source: 'tencent',
      provider: 'vkeys',
      duration: song.interval || 0
    }));
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[\s·・._\-—–()[\]（）【】《》<>]/g, '')
      .replace(/feat(?:uring)?\.?|ft\.?/g, '');
  }

  function trackKey(track) {
    return `${track.source}|${normalizeText(track.name)}|${normalizeText(track.artist)}`;
  }

  function dedupeTracks(tracks) {
    const seen = new Set();
    return tracks.filter(track => {
      const key = trackKey(track);
      if (!track.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function searchPlatform(platform, query, limit = 30) {
    if (platform === 'tencent') return searchVKeysTencent(query, limit);
    if (platform === 'kugou') {
      return searchMeting(METING_NODES.primary, 'kugou', query, 'kfjie', limit);
    }
    try {
      const results = await searchMeting(METING_NODES.primary, 'netease', query, 'kfjie', limit);
      if (results.length) return results;
    } catch (error) {
      console.warn('[音乐服务] 网易云主搜索节点不可用:', error.message);
    }
    return searchMeting(METING_NODES.neteaseFallback, 'netease', query, 'mikus', limit);
  }

  async function searchAll(query, limitPerPlatform = 20) {
    const requests = ['netease', 'tencent', 'kugou'].map(async platform => {
      try {
        return await searchPlatform(platform, query, limitPerPlatform);
      } catch (error) {
        console.warn(`[音乐服务] ${platform} 搜索失败:`, error.message);
        return [];
      }
    });
    return dedupeTracks((await Promise.all(requests)).flat());
  }

  async function getMetingCollection(type, id) {
    const data = await fetchJson(endpoint(METING_NODES.primary, {
      server: 'netease',
      type,
      id
    }));
    if (!Array.isArray(data)) return [];
    return data.map(song => mapMetingSong(song, 'netease', 'kfjie'));
  }

  function similarityScore(candidate, target) {
    const candidateName = normalizeText(candidate.name);
    const targetName = normalizeText(target.name);
    const candidateArtist = normalizeText(candidate.artist);
    const targetArtist = normalizeText(target.artist);
    let score = 0;
    if (candidateName === targetName) score += 70;
    else if (candidateName.includes(targetName) || targetName.includes(candidateName)) score += 42;
    if (candidateArtist === targetArtist) score += 30;
    else if (candidateArtist.includes(targetArtist) || targetArtist.includes(candidateArtist)) score += 18;
    return score;
  }

  function bestMatch(candidates, target, minimumScore = 55) {
    return candidates
      .map(candidate => ({ candidate, score: similarityScore(candidate, target) }))
      .filter(item => item.score >= minimumScore)
      .sort((a, b) => b.score - a.score)[0]?.candidate || null;
  }

  async function resolveTencent(track) {
    const result = await fetchJson(endpoint('https://api.vkeys.cn/v2/music/tencent', { id: track.id }));
    return withHttps(result?.data?.url || '');
  }

  async function resolveLegacyNetease(track) {
    try {
      const result = await fetchJson(endpoint('https://api.vkeys.cn/v2/music/netease', { id: track.id }));
      if (result?.data?.url) return withHttps(result.data.url);
    } catch (_) {
      // Continue to Meting search fallback.
    }
    return '';
  }

  async function refreshIdentity(track, allowCrossPlatform = true) {
    const source = track.source || track.onlineSource?.platform || 'netease';
    const query = `${track.name || ''} ${track.artist || ''}`.trim();
    let candidates = [];
    try {
      candidates = await searchPlatform(source, query, 20);
    } catch (_) {
      candidates = [];
    }
    let match = bestMatch(candidates, track);
    if (!match && allowCrossPlatform) {
      const all = await searchAll(query, 15);
      match = bestMatch(all, track, 70);
    }
    return match;
  }

  async function findAlternativeIdentity(track) {
    const source = track.source || track.platform || track.onlineSource?.platform || '';
    const query = `${track.name || ''} ${track.artist || ''}`.trim();
    const candidates = (await searchAll(query, 15)).filter(candidate => candidate.source !== source);
    return bestMatch(candidates, track, 70);
  }

  function identityFromTrack(track) {
    if (track.onlineSource) {
      return {
        ...track.onlineSource,
        name: track.name,
        artist: track.artist,
        cover: track.cover
      };
    }
    return track;
  }

  async function resolveSong(track, options = {}) {
    const sourceTrack = identityFromTrack(track);
    let resolvedTrack = sourceTrack;
    let url = '';

    if (options.preferAlternative) {
      const alternative = await findAlternativeIdentity(sourceTrack);
      if (!alternative) return null;
      resolvedTrack = alternative;
      url = alternative.source === 'tencent'
        ? await resolveTencent(alternative).catch(() => '')
        : withHttps(alternative.playUrl || '');
      return url ? { url: withHttps(url), identity: resolvedTrack } : null;
    }

    if (sourceTrack.source === 'tencent' || sourceTrack.platform === 'tencent') {
      url = await resolveTencent(sourceTrack).catch(() => '');
    } else if (sourceTrack.playUrl) {
      url = withHttps(sourceTrack.playUrl);
    } else if ((sourceTrack.source || sourceTrack.platform) === 'netease' && sourceTrack.id) {
      url = await resolveLegacyNetease(sourceTrack);
    }

    if (!url || options.forceRefresh) {
      const refreshed = await refreshIdentity(sourceTrack, options.allowCrossPlatform !== false);
      if (refreshed) {
        resolvedTrack = refreshed;
        url = refreshed.source === 'tencent'
          ? await resolveTencent(refreshed).catch(() => '')
          : withHttps(refreshed.playUrl || '');
      }
    }

    if (!url) return null;
    return { url: withHttps(url), identity: resolvedTrack };
  }

  async function loadLyrics(track) {
    const sourceTrack = identityFromTrack(track);
    if (sourceTrack.lyricUrl) {
      try { return await fetchText(sourceTrack.lyricUrl); } catch (_) { /* use API fallback */ }
    }
    const platform = sourceTrack.source || sourceTrack.platform;
    if (!sourceTrack.id || !['netease', 'tencent'].includes(platform)) return '';
    try {
      const result = await fetchJson(endpoint(`https://api.vkeys.cn/v2/music/${platform}/lyric`, { id: sourceTrack.id }));
      const data = result?.data || {};
      return [data.lrc || data.lyric || '', data.trans || data.tlyric || ''].filter(Boolean).join('\n');
    } catch (_) {
      return '';
    }
  }

  function toPlaylistTrack(song, resolvedUrl = '') {
    return {
      name: song.name,
      artist: song.artist || '未知歌手',
      src: withHttps(resolvedUrl),
      cover: withHttps(song.cover || PLACEHOLDER_COVER),
      isLocal: false,
      lrcContent: '',
      onlineSource: {
        platform: song.source || song.platform || 'netease',
        source: song.source || song.platform || 'netease',
        provider: song.provider || '',
        id: String(song.id || ''),
        mid: song.mid || '',
        playUrl: withHttps(song.playUrl || ''),
        lyricUrl: withHttps(song.lyricUrl || ''),
        duration: song.duration || 0
      },
      onlineResolvedAt: resolvedUrl ? Date.now() : 0
    };
  }

  function loadSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!session?.cookie || !NETEASE_SESSION_NODES.has(session.node)) return null;
      return session;
    } catch (_) {
      return null;
    }
  }

  function saveSession(cookie, profile, node = NETEASE_LOGIN_NODE) {
    const session = { node, cookie, profile, savedAt: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function accountError(stage, reason, code = '', retryable = false) {
    const error = new Error(`${stage}：${reason}`);
    Object.assign(error, { stage, code, retryable });
    return error;
  }

  async function neteaseRequest(path, params, session, stage, allowedCodes = [200]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    // Keep login credentials out of URLs, and do not depend on third-party browser cookies.
    const values = { ...params, noCookie: true };
    if (session?.cookie) values.cookie = session.cookie;
    try {
      const response = await fetch(endpoint(`${session?.node || NETEASE_LOGIN_NODE}${path}`, { timestamp: Date.now(), noCookie: true }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(values).toString(),
        credentials: 'omit', cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) {
        throw accountError(stage, `登录服务返回 HTTP ${response.status}，请稍后重试`, response.status,
          response.status === 429 || response.status >= 500);
      }
      let result;
      try { result = await response.json(); } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw accountError(stage, '登录服务返回了无法识别的数据，请稍后重试', 'invalid_response');
      }
      const code = Number(result?.code ?? result?.data?.code);
      if (code === 301) throw accountError(stage, '登录已失效，请重新扫码', 'login_expired');
      if (!allowedCodes.includes(code)) {
        // Do not display upstream error bodies, which may contain session information.
        throw accountError(stage, `登录服务返回异常状态${Number.isFinite(code) ? ` ${code}` : ''}，请稍后重试`,
          Number.isFinite(code) ? code : 'invalid_response', code === 429 || code >= 500);
      }
      return result;
    } catch (error) {
      if (error.stage) throw error;
      throw accountError(stage, error.name === 'AbortError' ? '请求超时，请重试' : '无法连接登录服务，请检查网络后重试',
        error.name === 'AbortError' ? 'timeout' : 'network', true);
    } finally {
      clearTimeout(timer);
    }
  }

  async function getLoginStatus(session = loadSession()) {
    if (!session) return null;
    const result = await neteaseRequest('/login/status', {}, session, '读取账号');
    const profile = result?.data?.profile || result?.profile || null;
    if (result?.data?.account === null && result?.data?.profile === null) {
      throw accountError('读取账号', '登录已失效，请重新扫码', 'login_expired');
    }
    if (!profile?.userId) throw accountError('读取账号', '尚未取得账号信息，请点击“重试读取账号”', 'missing_profile');
    // A response from a closed view or a logged-out account must not restore an old session.
    const current = loadSession();
    if (current?.cookie === session.cookie && current.node === session.node) saveSession(session.cookie, profile, session.node);
    return profile;
  }

  async function createQrLogin() {
    const keyResult = await neteaseRequest('/login/qr/key', {}, null, '生成二维码');
    const key = keyResult?.data?.unikey;
    if (!key) throw accountError('生成二维码', '登录服务没有返回二维码标识，请重试', 'missing_key');
    // The maintained API's web login flow includes chainId; old PC QR codes can fail after scanning.
    // Reference: NeteaseCloudMusicApiEnhanced/api-enhanced, public/qrlogin-nocookie.html
    const qrResult = await neteaseRequest('/login/qr/create', { key, qrimg: true, platform: 'web' }, null, '生成二维码');
    if (!qrResult?.data?.qrimg) throw accountError('生成二维码', '登录服务没有返回二维码图片，请重试', 'missing_qr');
    let qrUrl;
    try { qrUrl = new URL(qrResult.data.qrurl); } catch (_) { /* validated below */ }
    if (qrUrl?.origin !== 'https://music.163.com' || qrUrl.searchParams.get('codekey') !== key || !qrUrl.searchParams.get('chainId')) {
      throw accountError('生成二维码', '登录服务未返回新版网页二维码，请稍后重试', 'incompatible_qr');
    }
    return { key, qrimg: qrResult.data.qrimg, qrurl: qrResult.data.qrurl };
  }

  async function checkQrLogin(key) {
    const result = await neteaseRequest('/login/qr/check', { key }, null, '查询扫码状态', [800, 801, 802, 803]);
    return { ...result, code: Number(result.code) };
  }

  function acceptQrLogin(result) {
    if (result?.code !== 803 || typeof result.cookie !== 'string' || !result.cookie.trim()) {
      throw accountError('保存登录', '扫码已确认，但登录服务未返回登录凭证，请重新扫码', 'missing_cookie');
    }
    try { return saveSession(result.cookie, null); } catch (_) {
      throw accountError('保存登录', '浏览器无法保存登录状态，请检查存储空间或浏览器设置后重试', 'storage');
    }
  }

  async function getUserPlaylists() {
    const session = loadSession();
    const profile = session?.profile || await getLoginStatus(session);
    if (!profile?.userId) throw accountError('读取歌单', '请先扫码登录', 'login_expired');
    const playlists = [];
    const seen = new Set();
    for (let offset = 0; ; offset += 1000) {
      const result = await neteaseRequest('/user/playlist', { uid: profile.userId, limit: 1000, offset }, session, '读取歌单');
      if (!Array.isArray(result?.playlist) || (result.more && !result.playlist.length)) {
        throw accountError('读取歌单', '登录服务未返回完整歌单，请重试', 'invalid_playlists');
      }
      if (offset > 0 && result.playlist.length && result.playlist.every(item => seen.has(String(item.id)))) {
        throw accountError('读取歌单', '登录服务未返回下一页歌单，请重试', 'incomplete_playlists');
      }
      result.playlist.forEach(item => seen.add(String(item.id)));
      playlists.push(...result.playlist);
      if (!result.more) return playlists;
    }
  }

  async function getUserPlaylistTracks(playlistId) {
    const session = loadSession();
    if (!session) throw accountError('导入歌单', '请先登录网易云音乐', 'login_expired');
    const songs = [];
    const seen = new Set();
    for (let offset = 0; ; offset += 1000) {
      const result = await neteaseRequest('/playlist/track/all', { id: playlistId, limit: 1000, offset }, session, '导入歌单');
      if (!Array.isArray(result?.songs)) throw accountError('导入歌单', '登录服务未返回歌曲列表，请重试', 'invalid_tracks');
      if (offset > 0 && result.songs.length && result.songs.every(song => seen.has(String(song.id)))) {
        throw accountError('导入歌单', '登录服务未返回下一页歌曲，请重试', 'incomplete_tracks');
      }
      result.songs.forEach(song => seen.add(String(song.id)));
      songs.push(...result.songs);
      if (result.songs.length < 1000) break;
    }
    return songs.map(song => ({
      name: song.name || '未知歌曲',
      artist: Array.isArray(song.ar) ? song.ar.map(artist => artist.name).filter(Boolean).join('/') : '未知歌手',
      id: String(song.id || ''),
      cover: withHttps(song.al?.picUrl || PLACEHOLDER_COVER),
      source: 'netease',
      provider: 'netease-account',
      duration: song.dt || 0
    }));
  }

  window.MusicOnlineServices = {
    PLACEHOLDER_COVER,
    searchAll,
    searchPlatform,
    getPlaylist: id => getMetingCollection('playlist', id),
    getAlbum: id => getMetingCollection('album', id),
    resolveSong,
    loadLyrics,
    toPlaylistTrack,
    refreshIdentity,
    account: {
      node: NETEASE_LOGIN_NODE,
      loadSession,
      clearSession,
      getLoginStatus,
      createQrLogin,
      checkQrLogin,
      acceptQrLogin,
      getUserPlaylists,
      getUserPlaylistTracks
    }
  };
})();
