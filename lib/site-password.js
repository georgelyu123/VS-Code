import { timingSafeEqual } from 'node:crypto';

export function hasSitePassword(supplied) {
  const expected = process.env.SITE_PASSWORD;
  if (typeof supplied !== 'string' || !expected) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function passwordFromRequest(request) {
  return request.headers.get('x-site-password') || '';
}
