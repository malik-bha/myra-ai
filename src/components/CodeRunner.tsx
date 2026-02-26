import React, { useEffect, useRef } from 'react';

interface CodeRunnerProps {
  html: string;
}

export const CodeRunner: React.FC<CodeRunnerProps> = ({ html }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [html]);

  return (
    <div className="w-full h-full bg-white rounded-xl overflow-hidden shadow-inner border border-slate-200">
      <iframe
        ref={iframeRef}
        title="Live Preview"
        className="w-full h-full border-none"
        sandbox="allow-scripts allow-modals"
      />
    </div>
  );
};
