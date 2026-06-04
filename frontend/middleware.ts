import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Example: check for Firebase ID token in cookies or Authorization header
  const token = request.cookies.get('firebaseToken')?.value || request.headers.get('authorization')?.split('Bearer ')[1];
  // In a real implementation you would verify the token and extract the user role
  // For now we just forward the request; role enforcement is handled in each layout.
  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*'], // Apply to all routes
};
