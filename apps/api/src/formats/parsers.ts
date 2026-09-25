import type { Draft, SubmissionFormat } from '@blueprint/shared';
import { parseMermaidClassDiagram } from '@blueprint/shared';
import { ValidationError } from '../domain/errors';
import {
  normaliseDesign,
  validateEvaluable,
  type ParseResult,
  type SubmissionParser,
} from './submission-parser';

export class StructuredDesignParser implements SubmissionParser<'structured'> {
  readonly format = 'structured' as const;

  parse(draft: Extract<Draft, { format: 'structured' }>): ParseResult {
    const design = normaliseDesign(draft.design);
    const errors = validateEvaluable(design);
    return errors.length ? { ok: false, errors } : { ok: true, design, warnings: [] };
  }
}

/**
 * Mermaid drafts: classes and relationships come from the diagram, the written
 * sections (traceability, patterns, trade-offs) from the form.
 */
export class MermaidDesignParser implements SubmissionParser<'mermaid'> {
  readonly format = 'mermaid' as const;

  parse(draft: Extract<Draft, { format: 'mermaid' }>): ParseResult {
    const diagram = parseMermaidClassDiagram(draft.mermaid);
    if (diagram.errors.length) {
      return {
        ok: false,
        errors: diagram.errors.map((e) => ({ path: `mermaid:${e.line}`, message: `Line ${e.line}: ${e.message}` })),
      };
    }
    // Responsibilities are not expressible in Mermaid; keep any the learner wrote in the form.
    const formEntities = new Map(draft.design.entities.map((e) => [e.name.trim().toLowerCase(), e]));
    const entities = diagram.entities.map((e) => {
      const fromForm = formEntities.get(e.name.toLowerCase());
      return fromForm ? { ...e, responsibilities: fromForm.responsibilities } : e;
    });
    const design = normaliseDesign({ ...draft.design, entities, relationships: diagram.relationships });
    const errors = validateEvaluable(design);
    if (errors.length) return { ok: false, errors };
    return {
      ok: true,
      design,
      warnings: diagram.warnings.map((w) => ({ path: `mermaid:${w.line}`, message: `Line ${w.line}: ${w.message}` })),
    };
  }
}

/** Registry: the single place formats are looked up. Open for extension. */
export class SubmissionParserRegistry {
  private readonly parsers = new Map<SubmissionFormat, SubmissionParser>();

  register(parser: SubmissionParser): this {
    this.parsers.set(parser.format, parser);
    return this;
  }

  parse(draft: Draft): ParseResult {
    const parser = this.parsers.get(draft.format);
    if (!parser) throw new ValidationError(`Submission format "${draft.format}" is not supported.`);
    return (parser as SubmissionParser<typeof draft.format>).parse(draft as never);
  }

  formats(): SubmissionFormat[] {
    return [...this.parsers.keys()];
  }

  static withDefaults(): SubmissionParserRegistry {
    return new SubmissionParserRegistry().register(new StructuredDesignParser()).register(new MermaidDesignParser());
  }
}
