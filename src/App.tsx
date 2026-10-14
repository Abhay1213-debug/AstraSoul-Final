import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard, Login, Signup } from './pages/Account'
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
      { path: '/login', element: <Login /> },
      { path: '/signup', element: <Signup /> },
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/terms', element: <Terms /> },
      { path: '/refund-policy', element: <Refund /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]

export default function App() {
  return <RouterProvider router={createBrowserRouter(routes)} />
}
