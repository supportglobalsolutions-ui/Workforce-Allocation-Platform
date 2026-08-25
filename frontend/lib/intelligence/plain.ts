/** Rewrite ops jargon into plain English for cards and AI notes. */
export function plainText(text: string): string {
  if (!text) return text;

  let t = text;

  // Legacy rule copy (older API responses)
  t = t.replace(
    /Quality is the constraint[^.]*period average\s*([\d.]+)[^.]*floor\s*([\d.]+)/gi,
    'Quality score is $1 — you need at least $2',
  );
  t = t.replace(/Do not add headcount until scores recover[^.]*/gi, 'Fix quality before hiring anyone new.');
  t = t.replace(/Coach the bottom, do not hire over them\.?/gi, 'Help the lowest scores first.');
  t = t.replace(
    /\d+\s+machine[s]? in fleet and none produced this week/gi,
    'No machines did work this week',
  );
  t = t.replace(/The floor is dark[^.]*/gi, 'Nobody logged work on the machines this week.');
  t = t.replace(/Either demand died or claims are stuck\.?/gi, 'Check if there is no client work, or if logging was missed.');
  t = t.replace(/The alarm desk is quiet because the floor is quiet[^.]*/gi, 'Very little was logged recently.');
  t = t.replace(/Confirm claims and logging before you call this a good week\.?/gi, 'Check Sessions before you assume the week went well.');
  t = t.replace(/Open the RDP board and release or assign/gi, 'Open Machines and assign work');
  t = t.replace(/Rate and review the bottom of Quality/gi, 'Review low scores on Quality');

  // Single words
  t = t.replace(/\bheadcount\b/gi, 'new hires');
  t = t.replace(/\bconstraint\b/gi, 'main problem');
  t = t.replace(/\bplaybook\b/gi, 'plan');
  t = t.replace(/\balarm desk\b/gi, 'alerts');
  t = t.replace(/\bfleet\b/gi, 'machines');
  t = t.replace(/\bparked\b/gi, 'unused');
  t = t.replace(/\bproducing\b/gi, 'working');
  t = t.replace(/\bRDPs?\b/g, 'machines');
  t = t.replace(/\bRDP\b/g, 'machine');
  t = t.replace(/\bghost connection\b/gi, 'logged in but not working');
  t = t.replace(/\bpayslip row\b/gi, 'payslip');

  return t.replace(/\s{2,}/g, ' ').trim();
}
