import {
  Building2,
  Briefcase,
  User,
  Mail,
  ExternalLink,
  Newspaper,
  Target,
} from 'lucide-react';
import { formatCurrency, formatPercent } from '../utils/adaptResult';

const SENTIMENT_STYLES = {
  Positive: 'bg-emerald-500/10 text-emerald-500',
  Neutral: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Negative: 'bg-rose-500/10 text-rose-500',
};

const ENRICHMENT_STYLES = {
  COMPLIANCE_RESTRICTED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ENRICHED: 'bg-emerald-500/10 text-emerald-500',
};

const BODY = 'text-[#55698c] dark:text-[#8ca0c2]';
const STRONG = 'text-[#10233f] dark:text-slate-100';

function Section({ icon: Icon, title, children }) {
  return (
    <div className={`bg-brand-500/5 dark:bg-ink-600 rounded-xl p-3 text-[12px] ${BODY}`}>
      <div className={`flex items-center gap-1.5 font-semibold ${STRONG} mb-2`}>
        <Icon className="w-3.5 h-3.5 text-brand-500" strokeWidth={2} />
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="flex gap-2">
      <span className="shrink-0 w-[92px] text-slate-400 dark:text-ink-400 font-semibold">
        {label}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Badge({ className, children }) {
  return (
    <span className={`inline-block text-[10.5px] font-bold px-2 py-0.5 rounded-full ${className}`}>
      {children}
    </span>
  );
}

export default function Profile360({ profile }) {
  if (!profile) return null;

  const { narrative, company, account, customer, salesRep } = profile;
  const restricted = customer.enrichmentStatus === 'COMPLIANCE_RESTRICTED';

  return (
    <div className="mt-2.5 flex flex-col gap-2.5">
      {narrative.length > 0 && (
        <Section icon={Target} title="Overview">
          <ul className="flex flex-col gap-1">
            {narrative.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section icon={Building2} title="Company profile">
        <Row label="Company">{company.name}</Row>
        <Row label="Industry">{company.industry}</Row>
        <Row label="Segment">{company.segment}</Row>

        {company.news.length > 0 && (
          <div className="mt-1">
            <div className={`flex items-center gap-1.5 font-semibold ${STRONG} mb-1`}>
              <Newspaper className="w-3 h-3 text-slate-400" strokeWidth={2} />
              Recent news
            </div>
            <ul className="flex flex-col gap-1.5">
              {company.news.map((n, i) => (
                <li key={i}>
                  <div className={`font-semibold ${STRONG}`}>{n.title}</div>
                  {n.snippet && <div>{n.snippet}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {company.initiatives.length > 0 && (
          <div className="mt-1">
            <div className={`font-semibold ${STRONG} mb-1`}>Strategic initiatives</div>
            <ul className="list-disc list-inside">
              {company.initiatives.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section icon={Briefcase} title="Account profile">
        <Row label="Opportunity">{account.opportunityName}</Row>
        <Row label="Type">{account.opportunityType}</Row>
        <Row label="Stage">{account.currentStage}</Row>
        <Row label="Deal value">
          {account.dealValueArr != null ? formatCurrency(account.dealValueArr) : null}
        </Row>
        <Row label="Target close">{account.closeDateTarget}</Row>
        <Row label="Critical issue">{account.cbi}</Row>
        <Row label="Sentiment">
          {account.sentiment && (
            <Badge className={SENTIMENT_STYLES[account.sentiment] || 'bg-slate-400/10 text-slate-500'}>
              {account.sentiment}
            </Badge>
          )}
        </Row>
        <Row label="Objections">
          {account.objections.length > 0 ? account.objections.join(', ') : 'None noted'}
        </Row>
        {account.keyInterests.length > 0 && (
          <div className="mt-1">
            <div className={`font-semibold ${STRONG} mb-1`}>Key interests</div>
            <ul className="list-disc list-inside">
              {account.keyInterests.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section icon={User} title="Customer profile">
        <Row label="Contact">{customer.name}</Row>
        <Row label="Title">{customer.title}</Row>
        <Row label="Seniority">{customer.seniority}</Row>
        <Row label="Department">{customer.department}</Row>
        <Row label="Email">
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="inline-flex items-center gap-1 text-brand-500 hover:underline"
            >
              <Mail className="w-3 h-3 shrink-0" strokeWidth={2} />
              {customer.email}
            </a>
          )}
        </Row>
        <Row label="LinkedIn">
          {customer.linkedinUrl && (
            <a
              href={customer.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand-500 hover:underline"
            >
              <ExternalLink className="w-3 h-3 shrink-0" strokeWidth={2} />
              View profile
            </a>
          )}
        </Row>
        <Row label="Enrichment">
          {customer.enrichmentStatus && (
            <Badge className={ENRICHMENT_STYLES[customer.enrichmentStatus] || 'bg-slate-400/10 text-slate-500'}>
              {customer.enrichmentStatus.replace(/_/g, ' ')}
            </Badge>
          )}
        </Row>
        {restricted && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400">
            Lusha returned no verified match, so the email and LinkedIn link are unverified.
          </div>
        )}

        <div className={`mt-1.5 pt-2 border-t border-brand-200 dark:border-ink-500 font-semibold ${STRONG}`}>
          Lusha profile
        </div>
        {!customer.lusha ? (
          <Row label="Details">Not available</Row>
        ) : (
          <>
            <Row label="Email">
              {customer.lusha.emails.length > 0 && (
                <span className="flex flex-col gap-0.5">
                  {customer.lusha.emails.map((e) => (
                    <a key={e} href={`mailto:${e}`} className="text-brand-500 hover:underline">
                      {e}
                    </a>
                  ))}
                </span>
              )}
            </Row>
            <Row label="Phone">
              {customer.lusha.phones.length > 0 && (
                <span className="flex flex-col gap-0.5">
                  {customer.lusha.phones.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </span>
              )}
            </Row>
            <Row label="Seniority">{customer.lusha.seniority.join(', ')}</Row>
            <Row label="Department">{customer.lusha.departments.join(', ')}</Row>
            <Row label="Social links">
              {customer.lusha.socialLinks.length > 0 && (
                <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {customer.lusha.socialLinks.map((s) => (
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand-500 hover:underline capitalize"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" strokeWidth={2} />
                      {s.label}
                    </a>
                  ))}
                </span>
              )}
            </Row>
            <Row label="Skills">
              {customer.lusha.skills.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {customer.lusha.skills.map((s) => (
                    <span
                      key={s}
                      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500"
                    >
                      {s}
                    </span>
                  ))}
                </span>
              )}
            </Row>
            <Row label="Previous jobs">
              {customer.lusha.previousEmployment.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {customer.lusha.previousEmployment.map((j, i) => (
                    <li key={i}>
                      <span className={`font-semibold ${STRONG}`}>{j.company}</span>
                      {j.title && <span> — {j.title}</span>}
                      {j.period && <span className="text-slate-400 dark:text-ink-400"> ({j.period})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Row>
          </>
        )}
      </Section>

      <Section icon={Target} title="Sales rep profile">
        <Row label="Rep">{salesRep.name}</Row>
        <Row label="Tier">{salesRep.tier}</Row>
        <Row label="Attainment">
          {salesRep.attainmentPct != null ? formatPercent(salesRep.attainmentPct) : null}
        </Row>
      </Section>
    </div>
  );
}