import { Navigate, createBrowserRouter } from 'react-router-dom'
import { BuilderPage } from './pages/BuilderPage'
import { JobStatusPage } from './pages/JobStatusPage'
import { NotFoundPage } from './pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BuilderPage />,
  },
  {
    path: '/builder',
    element: <Navigate to="/" replace />,
  },
  {
    path: '/docs',
    element: <Navigate to="/" replace />,
  },
  {
    path: '/jobs/:jobId',
    element: <JobStatusPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
