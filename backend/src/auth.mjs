import { AppError } from './errors.mjs';

export async function authenticate(request, { commonApi, repository }) {
  const header = request.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9_.~-]{16,4096}$/.test(header)) throw new AppError(401, 'LOGIN_REQUIRED', '请先通过公共账号页面登录');
  let response;
  try { response = await fetch(`${commonApi.replace(/\/$/, '')}/auth/me`, { headers: { authorization: header, 'accept-language': 'zh' }, signal: AbortSignal.timeout(5000), redirect: 'error' }); }
  catch { throw new AppError(503, 'AUTH_UNAVAILABLE', '公共身份服务暂时无法连接，请稍后重试'); }
  if ([401, 403, 404].includes(response.status)) throw new AppError(401, 'SESSION_INVALID', '登录已失效，请重新登录');
  if (!response.ok) throw new AppError(503, 'AUTH_UNAVAILABLE', '公共身份服务暂时不可用');
  const profile = await response.json();
  return repository.user(profile.id);
}
