import { NextResponse } from "next/server";
import { ERROR_CODES, type ErrorCode } from "./error-codes";

export function ok<T>(data?: T, init?: ResponseInit): Response {
  return NextResponse.json({ code: ERROR_CODES.OK, message: "ok", data: data ?? null }, init);
}

export function fail(code: ErrorCode, message: string, status = 400): Response {
  return NextResponse.json({ code, message, data: null }, { status });
}
