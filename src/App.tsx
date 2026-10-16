import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AuthProvider } from './lib/auth'
import { DataProvider } from './lib/data'
import { Dashboard, ForgotPassword, Login, ResetPassword, Signup } from './pages/Account'
import MyRequest from './pages/MyRequest'
import Payment from './pages/Payment'
import Security from './pages/Security'
import About from './pages/About'
import Consultation from './pages/Consultation'
import ConsultationRequest from './pages/ConsultationRequest'
import Contact from './pages/Contact'
import Experts from './pages/Experts'
import FreeInsight from './pages/FreeInsight'
import Home from './pages/Home'
import HowItWorks from './pages/HowItWorks'
import { Privacy, Refund, Terms } from './pages/Legal'
import NotFound from './pages/NotFound'
import ServiceDetail from './pages/ServiceDetail'
import Services from './pages/Services'

/**
 * The administrator and expert screens are only for staff, so they are loaded on demand: ordinary visitors never download them
 * and the public pages stay as light as before.
 */
function adminPage(name: string) {
  const Page = lazy(() =>
    import('./pages/Admin').then((m) => ({ default: (m as unknown as Record<string, ComponentType>)[name] as ComponentType })),
  )
  return (
    <Suspense fallback={<p className="container" role="status" style={{ padding: '4rem 0' }}>Loading…</p>}>
      <Page />
    </Suspense>
  )
}

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/about', element: <About /> },
      { path: '/services', element: <Services /> },
      { path: '/services/:slug', element: <ServiceDetail /> },
      { path: '/how-it-works', element: <HowItWorks /> },
      { path: '/experts', element: <Experts /> },
      { path: '/consultation', element: <Consultation /> },
      { path: '/consultation/request', element: <ConsultationRequest /> },
      { path: '/free-insight', element: <FreeInsight /> },
      // Retired page (astrology is not part of the service offering): send old links to the free insight.
      { path: '/weekly-horoscope', element: <Navigate to="/free-insight" replace /> },
      { path: '/contact', element: <Contact /> },
      { path: '/payment', element: <Payment /> },
      { path: '/login', element: <Login /> },
      { path: '/signup', element: <Signup /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/dashboard/requests/:id', element: <MyRequest /> },
      { path: '/dashboard/security', element: <Security /> },
      { path: '/admin', element: adminPage('AdminOverview') },
      { path: '/admin/requests', element: adminPage('AdminRequests') },
      { path: '/admin/requests/:id', element: adminPage('AdminRequestDetail') },
      { path: '/admin/services', element: adminPage('AdminServices') },
      { path: '/admin/experts', element: adminPage('AdminExperts') },
      { path: '/admin/settings', element: adminPage('AdminSettings') },
      { path: '/admin/audit', element: adminPage('AdminAudit') },
      { path: '/staff', element: adminPage('StaffHome') },
      { path: '/staff/requests/:id', element: adminPage('StaffRequestDetail') },
      { path: '/privacy', element: <Privacy /> },
      { path: '/terms', element: <Terms /> },
      { path: '/refund-policy', element: <Refund /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <RouterProvider router={createBrowserRouter(routes)} />
      </DataProvider>
    </AuthProvider>
  )
}
