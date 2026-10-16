import { Navigate, useParams, type RouteObject } from 'react-router-dom';

const page = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) => () => loader().then((m) => ({ Component: m[name] }));

const cms = () => import('./pages/CmsPage');
const events = () => import('./pages/Events');
const services = () => import('./pages/Services');
const portfolio = () => import('./pages/Portfolio');
const packages = () => import('./pages/Packages');
const venues = () => import('./pages/Venues');
const journal = () => import('./pages/Journal');
const inquire = () => import('./pages/Inquire');
const track = () => import('./pages/Track');
const preview = () => import('./pages/Preview');
const invitation = () => import('./pages/Invitation');

function BlogRedirect() {
  const { slug } = useParams();
  return <Navigate to={slug ? `/journal/${slug}` : '/journal'} replace />;
}

/** Public website routes (children of PublicLayout). */
export const publicRoutes: RouteObject[] = [
  { path: '/', lazy: page(cms, 'HomePage') },
  { path: '/about', lazy: page(cms, 'AboutPage') },
  { path: '/contact', lazy: page(cms, 'ContactPage') },
  { path: '/events', lazy: page(events, 'EventsIndex') },
  { path: '/events/:slug', lazy: page(events, 'EventDetail') },
  { path: '/services', lazy: page(services, 'ServicesIndex') },
  { path: '/services/:slug', lazy: page(services, 'ServiceDetail') },
  { path: '/portfolio', lazy: page(portfolio, 'PortfolioIndex') },
  { path: '/portfolio/:slug', lazy: page(portfolio, 'ProjectDetail') },
  { path: '/packages', lazy: page(packages, 'PackagesIndex') },
  { path: '/packages/:slug', lazy: page(packages, 'PackageDetail') },
  { path: '/venues', lazy: page(venues, 'VenuesIndex') },
  { path: '/venues/:slug', lazy: page(venues, 'VenueDetail') },
  { path: '/journal', lazy: page(journal, 'JournalIndex') },
  { path: '/journal/:slug', lazy: page(journal, 'ArticlePage') },
  { path: '/blog', element: <BlogRedirect /> },
  { path: '/blog/:slug', element: <BlogRedirect /> },
  { path: '/inquire', lazy: page(inquire, 'InquirePage') },
  { path: '/inquire/thank-you', lazy: page(inquire, 'ThankYouPage') },
  { path: '/track', lazy: page(track, 'TrackPage') },
  { path: '/preview/page/:pageId', lazy: page(preview, 'PagePreview') },
  { path: '/preview/site', lazy: page(preview, 'SitePreview') },
  { path: '/:slug', lazy: () => cms().then((m) => ({ Component: m.default })) },
  { path: '*', lazy: () => import('./pages/NotFound').then((m) => ({ Component: m.default })) },
];

/** Routes rendered without the public chrome (e.g. CMS preview iframes, RSVP). */
export const bareRoutes: RouteObject[] = [
  { path: '/rsvp/:code', lazy: page(invitation, 'RsvpPage') },
  { path: '/e/:slug', lazy: page(invitation, 'MicrositePage') },
];
