export type Locale = 'en' | 'zh'

export const DEFAULT_LOCALE: Locale = 'en'
export const SUPPORTED_LOCALES: Locale[] = ['en', 'zh']

export const LOCALE_STORAGE_KEY = 'pdf-outline-builder:locale'

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
}

export type InterpolationValues = Record<string, string | number>

export interface Dictionary {
  nav: {
    home: string
    builder: string
    docs: string
  }
  layout: {
    brand: string
  }
  language: {
    label: string
    switchTo: string
  }
  home: {
    headerEyebrow: string
    headerTitle: string
    headerDescription: string
    openBuilder: string
    readConstraints: string
    layoutTitle: string
    mvpEyebrow: string
    mvpLineOne: string
    mvpLineTwo: string
    mvpLineThree: string
    highlights: {
      localFirst: { title: string; description: string }
      treeEditing: { title: string; description: string }
      minimalBackend: { title: string; description: string }
    }
  }
  docs: {
    layoutTitle: string
    eyebrow: string
    title: string
    sections: readonly string[]
  }
  notFound: {
    layoutTitle: string
    title: string
    description: string
    openBuilder: string
  }
  jobStatus: {
    layoutTitle: string
    eyebrow: string
    title: string
    missingJobId: string
    loadFailed: string
    job: string
    status: string
    file: string
    created: string
    updated: string
    download: string
    loading: string
    backToBuilder: string
  }
  builder: {
    layoutTitle: string
    actions: {
      uploadPdf: string
      aiAnalyse: string
      refining: string
      downloadPayload: string
      exportingLoading: string
      uploading: string
      exportLoad: string
    }
    hero: {
      eyebrow: string
      title: string
      description: string
      choosePdf: string
      rerun: string
    }
    fileBadges: {
      pages: string
      sourceUploaded: string
      job: string
    }
    parseErrors: {
      default: string
    }
    summary: {
      pages: string
      analyzedLines: string
      detectedHeadings: string
      embeddedBookmarks: string
    }
    preview: {
      title: string
      description: string
      none: string
    }
    editor: {
      title: string
      aiBadge: string
      description: string
      addRoot: string
      detected: string
      embedded: string
      merged: string
      expandAll: string
      collapseAll: string
      emptyState: string
      bannerHint: string
    }
    parsingOverlay: {
      pdfTitle: string
      pdfDescription: string
      outlineTitle: string
      outlineDescription: string
      readingTitle: string
      readingDescription: string
    }
    contract: {
      title: string
      description: string
      openExportedPdf: string
      openJobDetails: string
      backendEndpoint: string
    }
    payload: {
      title: string
      description: string
      copying: string
      copy: string
      save: string
    }
    empty: {
      eyebrow: string
      title: string
      description: string
      choosePdf: string
      analyzing: string
    }
    tree: {
      untitled: string
      newSection: string
      indentRoot: string
      indent: string
      level: string
      page: string
      titleField: string
      up: string
      down: string
      outdent: string
      indentBtn: string
      child: string
      after: string
      remove: string
      expand: string
      collapse: string
      noChildren: string
    }
    export: {
      copySuccess: string
      copyFailed: string
      downloading: string
      downloadFailedPrefix: string
      doneReloading: string
      uploadStep: string
      submitStep: string
      jobFailedFallback: string
      exportFailed: string
      jobStillProcessing: string
      jobFailedGeneric: string
      missingDownload: string
    }
    refine: {
      refining: string
      emptyResult: string
      emptyNotification: string
      blockedTitle: string
      blockedDescription: string
      blockedHint: string
      successTitle: string
      failureTitle: string
      failureFallback: string
      failurePreserved: string
      summaryKept: string
      summaryDropped: string
      notificationKeptAll: string
      notificationDropped: string
    }
  }
}
