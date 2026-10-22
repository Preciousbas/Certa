export default async function DocumentAnchorPage({ params }: { params: Promise<{ projectId: string; docId: string }> }) {
  const { docId } = await params;
  return (
    <div>
      <p className="eyebrow">Document</p>
      <h1>Where the figure came from</h1>
      <p className="muted">File {docId}. A source chip such as p.4 or BoQ!F27 opens this page at that anchor, with the quoted text marked.</p>
    </div>
  );
}
