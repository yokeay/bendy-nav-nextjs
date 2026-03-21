import type { NextRequest, NextResponse } from "next/server";
import { dispatchLegacyRoute } from "@/server/router/legacy-router";

type PathParams = Promise<{ path: string[] }>;
type PathResolver = (paramsPromise: PathParams) => Promise<string[]>;

type RouteContext = {
  params: PathParams;
};

type RouteHandler = (
  request: NextRequest,
  context?: RouteContext
) => Promise<NextResponse>;

type LegacyHttpHandlers = {
  GET: RouteHandler;
  POST: RouteHandler;
  PUT: RouteHandler;
  DELETE: RouteHandler;
  PATCH: RouteHandler;
  OPTIONS: RouteHandler;
};

function createHandler(pathResolver?: PathResolver): RouteHandler {
  return async (request: NextRequest, context?: RouteContext) => {
    const pathSegments = pathResolver && context ? await pathResolver(context.params) : [];
    return dispatchLegacyRoute(request, pathSegments);
  };
}

export function createLegacyPathHandlers(pathResolver: PathResolver): LegacyHttpHandlers {
  const handler = createHandler(pathResolver);
  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    DELETE: handler,
    PATCH: handler,
    OPTIONS: handler
  };
}

const rootHandler = createHandler();

export const legacyHttpHandlers: LegacyHttpHandlers = {
  GET: rootHandler,
  POST: rootHandler,
  PUT: rootHandler,
  DELETE: rootHandler,
  PATCH: rootHandler,
  OPTIONS: rootHandler
};
