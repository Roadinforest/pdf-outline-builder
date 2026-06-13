import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { I18nProvider } from './i18n'
import { router } from './router'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <RouterProvider router={router} />
  </I18nProvider>,
)
