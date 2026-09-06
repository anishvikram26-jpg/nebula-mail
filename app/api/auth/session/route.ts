import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
    });
  } catch (error) {
    console.error(
      '[Session API Error]',
      error instanceof Error ? error.message : 'Unknown session error'
    );
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 500 }
    );
  }
}
