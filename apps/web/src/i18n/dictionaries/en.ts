import type { Dictionary } from '../types'

const dictionary: Dictionary = {
  nav: {
    home: 'Home',
    builder: 'Builder',
    docs: 'Docs',
  },
  layout: {
    brand: 'PDF Outline Builder',
  },
  language: {
    label: 'Language',
    switchTo: 'Switch language',
  },
  home: {
    headerEyebrow: 'React + Hono + Blob',
    headerTitle: 'Build PDF bookmarks in the browser, export once on the server.',
    headerDescription:
      'This monorepo follows the deployment plan directly: a Vite front end, a Hono API, shared schemas, client uploads for Vercel Blob, and a synchronous export pipeline that still records jobs.',
    openBuilder: 'Open Builder',
    readConstraints: 'Read Constraints',
    layoutTitle: 'Independent Vercel-ready product',
    mvpEyebrow: 'MVP Boundaries',
    mvpLineOne: 'Recommended for text PDFs up to 50MB and roughly 300 pages.',
    mvpLineTwo:
      'Unsupported by design in this version: OCR, bulk processing, and long-running background queues.',
    mvpLineThree:
      'The API ships with an in-memory job store for local work and uses Vercel Blob when its token exists.',
    highlights: {
      localFirst: {
        title: 'Local-first parsing',
        description:
          'PDF.js runs in the browser, so text extraction and heading detection happen before any upload.',
      },
      treeEditing: {
        title: 'Tree-based outline editing',
        description:
          'The editor keeps flat PDF outline data readable while exposing it as a nested tree you can fix quickly.',
      },
      minimalBackend: {
        title: 'Minimal export backend',
        description:
          'The API only receives the final source blob URL and approved outline payload, reducing server cost.',
      },
    },
  },
  docs: {
    layoutTitle: 'Limits, privacy, and operational notes',
    eyebrow: 'Operational Guide',
    title: 'What this version is optimized for',
    sections: [
      'Files should stay at or below 50MB and 300 pages for the current Vercel-first export path.',
      'The browser extracts text locally. Only the uploaded PDF blob URL and approved outline JSON go to the API.',
      'Anonymous abuse protection is not wired yet. The upload and export routes are structured so rate limiting can be added cleanly.',
      'Local development falls back to filesystem-backed uploads when Vercel Blob tokens are not configured.',
    ],
  },
  notFound: {
    layoutTitle: 'Page not found',
    title: 'Unknown route',
    description: 'Use the builder to parse a PDF, upload it to Blob, and export an outlined copy.',
    openBuilder: 'Open Builder',
  },
  jobStatus: {
    layoutTitle: 'Export job status',
    eyebrow: 'Job Tracker',
    title: 'Export status',
    missingJobId: 'Missing job id.',
    loadFailed: 'Failed to load job.',
    job: 'Job',
    status: 'Status',
    file: 'File',
    created: 'Created',
    updated: 'Updated',
    download: 'Download outlined PDF',
    loading: 'Loading job state...',
    backToBuilder: 'Back to builder',
  },
  builder: {
    layoutTitle: 'PDF Outline Studio',
    actions: {
      uploadPdf: 'Open PDF',
      ocrPdf: 'OCR PDF',
      ocrUnavailable: 'OCR is temporarily unavailable',
      ocring: 'Running OCR...',
      aiAnalyse: 'AI Analyse',
      refining: 'Refining...',
      exportingLoading: 'Uploading, Exporting & Loading...',
      uploading: 'Uploading source PDF...',
      exportLoad: 'Upload, Export & Load PDF',
    },
    hero: {
      eyebrow: 'Browser First',
      title: 'Parse locally, export only once',
      description:
        'This flow keeps PDF reading, text extraction, outline guessing, and manual edits inside the browser. The backend only receives the uploaded source blob URL plus your approved outline when it is time to write bookmarks back into the file.',
      choosePdf: 'Open a PDF',
      rerun: 'Re-run detection',
    },
    fileBadges: {
      pages: '{count} pages',
      sourceUploaded: 'Source PDF uploaded',
      job: 'Job #{id}',
    },
    parseErrors: {
      default: 'Failed to parse the PDF file.',
    },
    summary: {
      pages: 'Pages',
      analyzedLines: 'Analyzed Lines',
      detectedHeadings: 'Detected Headings',
      embeddedBookmarks: 'Embedded Bookmarks',
    },
    preview: {
      title: 'Document preview',
      description: 'The PDF stays local until you export. Use this view to compare pages against the outline.',
      none: 'No preview available.',
    },
    editor: {
      title: 'Outline tree editor',
      aiBadge: 'AI refined',
      description: 'Edit the hierarchy directly as a tree. Reordering keeps whole branches together.',
      addRoot: 'Add root',
      detected: 'Detected ({count})',
      embedded: 'Embedded ({count})',
      merged: 'Merged ({count})',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      emptyState: 'No outline nodes yet. Try the detected preset or add a root section.',
      bannerHint:
        'Order still follows the export sequence, but you now edit it as nested branches instead of one long flat list.',
    },
    parsingOverlay: {
      pdfTitle: 'Analyzing PDF',
      pdfDescription: 'Extracting text, checking embedded bookmarks, and generating a candidate outline.',
      outlineTitle: 'Building outline',
      outlineDescription:
        'Scoring headings by size, numbering, and layout so the editor can open with a usable tree.',
      readingTitle: 'Reading your PDF',
      readingDescription:
        'The browser is loading pages, extracting text, and preparing the initial outline.',
    },
    empty: {
      eyebrow: 'MVP Flow',
      title: 'Open a PDF to start a browser-side pass',
      description:
        'The page will inspect existing bookmarks, extract text with PDF.js, infer a heading structure, and prepare the final JSON request used by the export service to write bookmarks back into the PDF.',
      choosePdf: 'Open a PDF',
      analyzing: 'Analyzing...',
    },
    tree: {
      untitled: 'Untitled section',
      newSection: 'New section',
      indentRoot: 'Root',
      indent: 'Indent {depth}',
      level: 'Level',
      page: 'Page',
      titleField: 'Title',
      up: 'Up',
      down: 'Down',
      outdent: 'Outdent',
      indentBtn: 'Indent',
      child: 'Child',
      after: 'After',
      remove: 'Remove {title}',
      expand: 'Expand section',
      collapse: 'Collapse section',
      noChildren: 'No child sections',
    },
    export: {
      downloading: 'Downloading exported PDF and reloading the workspace...',
      downloadFailedPrefix: 'Could not download exported PDF',
      doneReloading: 'Outlined PDF downloaded and loaded into the builder.',
      uploadStep: 'Uploading source PDF...',
      submitStep: 'Submitting export job...',
      exportFailed: 'Export failed.',
      jobStillProcessing:
        'Export job is still processing. Open the job page and continue there.',
      jobFailedGeneric: 'Export job failed.',
      missingDownload: 'Export finished without a downloadable PDF.',
    },
    ocr: {
      converting: 'Converting the PDF with OCR and adding a searchable text layer...',
      converted: 'OCR PDF converted and loaded into the builder.',
      failed: 'OCR conversion failed.',
      blockedTitle: 'OCR is converting the PDF',
      blockedDescription:
        'Rendering pages, recognizing text, and writing a searchable text layer. This may take a while for large scanned PDFs.',
      blockedHint: 'Please wait',
    },
    refine: {
      refining: 'Asking the LLM to filter and clean the outline...',
      emptyResult: 'The LLM returned an empty outline. The original list is preserved.',
      emptyNotification: 'The AI returned an empty outline, so the current tree was kept as-is.',
      blockedTitle: 'AI is refining the outline',
      blockedDescription:
        'Filtering headings, cleaning titles, and rebuilding the detected outline. Other actions are temporarily disabled to keep the editor state consistent.',
      blockedHint: 'Please wait',
      successTitle: 'AI refinement complete',
      failureTitle: 'AI refinement failed',
      failureFallback: 'The outline could not be refined this time.',
      failurePreserved: 'The original outline is unchanged.',
      summaryKept: 'AI refinement complete ({kept} kept).',
      summaryDropped: 'AI refinement complete ({kept} kept, {dropped} dropped).',
      notificationKeptAll: 'Updated the outline tree with {kept} AI-cleaned headings.',
      notificationDropped: 'Updated the outline tree with {kept} AI-cleaned headings and removed {dropped} lower-quality entries.',
    },
  },
}

export default dictionary
