import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // headings
        h1: ({ children }) => (
          <h1
            className="text-base font-semibold
       text-white mb-2 mt-3 first:mt-0"
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className="text-[13px] font-semibold
       text-white mb-1.5 mt-3 first:mt-0"
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className="text-[12px] font-semibold
       text-white/80 mb-1 mt-2 first:mt-0"
          >
            {children}
          </h3>
        ),
        // paragraph
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 text-white/80">{children}</p>
        ),
        // bold
        strong: ({ children }) => (
          <strong className="font-semibold text-white">{children}</strong>
        ),
        // italic
        em: ({ children }) => (
          <em className="italic text-white/70">{children}</em>
        ),
        // bullet list
        ul: ({ children }) => (
          <ul className="mb-2 space-y-1 pl-1">{children}</ul>
        ),
        // numbered list
        ol: ({ children }) => (
          <ol
            className="mb-2 space-y-1 pl-1 list-decimal
       list-inside"
          >
            {children}
          </ol>
        ),
        // list item
        li: ({ children }) => (
          <li
            className="text-white/80 flex gap-2
       items-start"
          >
            <span
              className="text-aw-purple mt-0.5
         flex-shrink-0"
            >
              •
            </span>
            <span>{children}</span>
          </li>
        ),
        // horizontal rule
        hr: () => <hr className="border-aw-border my-3" />,
        // inline code
        code: ({ children }) => (
          <code
            className="bg-white/10 text-aw-teal
       px-1.5 py-0.5 rounded text-[11px]
       font-mono"
          >
            {children}
          </code>
        ),
        // blockquote
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-2
       border-aw-purple pl-3 my-2
       text-white/50 italic"
          >
            {children}
          </blockquote>
        ),
        // add table components
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table
              className="w-full border-collapse
          text-[12px]"
            >
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="border-b border-aw-border">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr
            className="border-b border-aw-border/50
        last:border-0"
          >
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th
            className="text-left py-1.5 px-3
        text-[10px] font-medium uppercase
        tracking-widest text-white/30
        first:pl-0"
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            className="py-1.5 px-3
        text-white/70 first:pl-0"
          >
            {children}
          </td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
