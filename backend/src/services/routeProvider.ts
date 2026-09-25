export interface RouteProvider {
  readonly name: 'demo';
  createRoute(): string;
}

export const demoRouteProvider: RouteProvider = {
  name: 'demo',
  createRoute: () => 'Demo route: pickup and destination recorded; live distance and GPS are not configured.',
};

export function createDemoRoute(): string { return demoRouteProvider.createRoute(); }