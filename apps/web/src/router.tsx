import { createBrowserRouter } from 'react-router-dom'
import { BuilderPage } from './pages/BuilderPage'
import { DocsPage } from './pages/DocsPage'
import { HomePage } from './pages/HomePage'
import { JobStatusPage } from './pages/JobStatusPage'
import { NotFoundPage } from './pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/builder',
    element: <BuilderPage />,
  },
  {
    path: '/docs',
    element: <DocsPage />,
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
