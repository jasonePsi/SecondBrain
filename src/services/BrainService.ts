import { Action, ActionRepo, parseActionPayload } from '../repositories/action_repo';
import { Entity, EntityRepo } from '../repositories/entity_repo';
import { Fact, FactRepo } from '../repositories/fact_repo';
import { safeJsonParse } from '../repositories/json_utils';
import { Space, SpaceRepo } from '../repositories/space_repo';
import { Thread, ThreadRepo } from '../repositories/thread_repo';

type SupportedScope = 'thread' | 'space' | 'global';

const MAX_ENTITIES = 120;
const MAX_FACTS = 120;
const MAX_OPEN_ACTIONS = 80;

const routeForScope = (
    scopeType: SupportedScope,
    scopeId: string | null
): string | undefined => {
    if (scopeType === 'thread' && scopeId) return `/thread/${scopeId}`;
    if (scopeType === 'space' && scopeId) return `/space/${scopeId}`;
    return undefined;
};

const formatFactValue = (fact: Fact): string => {
    const parsed = safeJsonParse<any>(fact.value_json, fact.value_json);
    if (parsed === null || parsed === undefined) return 'null';
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'number' || typeof parsed === 'boolean') return String(parsed);
    try {
        return JSON.stringify(parsed);
    } catch {
        return String(parsed);
    }
};

const dedupeLatestFacts = (facts: Fact[], limit: number): Fact[] => {
    const picked: Fact[] = [];
    const seen = new Set<string>();
    for (const fact of facts) {
        const dedupeKey = `${fact.scope_type}:${fact.scope_id || ''}:${fact.entity_id || ''}:${fact.key}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        picked.push(fact);
        if (picked.length >= limit) break;
    }
    return picked;
};

const toScopeLabel = (
    scopeType: SupportedScope,
    scopeId: string | null,
    threadMap: Map<string, Thread>,
    spaceMap: Map<string, Space>
): string => {
    if (scopeType === 'global') return 'Global';
    if (scopeType === 'thread') {
        if (!scopeId) return 'Thread';
        const thread = threadMap.get(scopeId);
        return thread ? `Thread: ${thread.title}` : 'Thread';
    }
    if (!scopeId) return 'Space';
    const space = spaceMap.get(scopeId);
    return space ? `Space: ${space.name}` : 'Space';
};

const toActionText = (action: Action): string => {
    const payload = parseActionPayload<{ text?: string }>(action, {});
    const value = typeof payload.text === 'string' ? payload.text.trim() : '';
    return value || action.type;
};

export interface BrainEntityCard {
    id: string;
    name: string;
    type: string;
    createdAt: number;
    scopeLabel: string;
    route?: string;
}

export interface BrainFactCard {
    id: string;
    key: string;
    value: string;
    unit: string | null;
    effectiveAt: number;
    createdAt: number;
    scopeLabel: string;
    route?: string;
}

export interface BrainActionCard {
    id: string;
    type: Action['type'];
    text: string;
    status: Action['status'];
    scheduledFor: number | null;
    createdAt: number;
    scopeLabel: string;
    route?: string;
}

export interface BrainSnapshot {
    entities: BrainEntityCard[];
    facts: BrainFactCard[];
    actions: BrainActionCard[];
    loadedAt: number;
}

export const BrainService = {
    getSnapshot: async (): Promise<BrainSnapshot> => {
        const [entityRows, factRowsRaw, actionRows] = await Promise.all([
            EntityRepo.listRecent(MAX_ENTITIES),
            FactRepo.listRecent(MAX_FACTS * 2),
            ActionRepo.listOpen(MAX_OPEN_ACTIONS)
        ]);

        const factRows = dedupeLatestFacts(factRowsRaw, MAX_FACTS);
        const threadIds = new Set<string>();
        const spaceIds = new Set<string>();

        entityRows.forEach((entity: Entity) => {
            if (entity.thread_id) threadIds.add(entity.thread_id);
        });

        factRows.forEach((fact: Fact) => {
            if (fact.scope_type === 'thread' && fact.scope_id) threadIds.add(fact.scope_id);
            if (fact.scope_type === 'space' && fact.scope_id) spaceIds.add(fact.scope_id);
        });

        actionRows.forEach((action: Action) => {
            if (action.scope_type === 'thread' && action.scope_id) threadIds.add(action.scope_id);
            if (action.scope_type === 'space' && action.scope_id) spaceIds.add(action.scope_id);
        });

        const threads = await ThreadRepo.getByIds([...threadIds]);
        threads.forEach((thread) => {
            if (thread.space_id) spaceIds.add(thread.space_id);
        });
        const spaces = await SpaceRepo.getByIds([...spaceIds]);

        const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
        const spaceMap = new Map(spaces.map((space) => [space.id, space]));

        const entities: BrainEntityCard[] = entityRows.map((entity) => {
            const route = entity.thread_id ? `/thread/${entity.thread_id}` : undefined;
            const scopeLabel = entity.thread_id
                ? toScopeLabel('thread', entity.thread_id, threadMap, spaceMap)
                : 'Global';

            return {
                id: entity.id,
                name: entity.name,
                type: entity.type,
                createdAt: entity.created_at,
                scopeLabel,
                route
            };
        });

        const facts: BrainFactCard[] = factRows.map((fact) => ({
            id: fact.id,
            key: fact.key,
            value: formatFactValue(fact),
            unit: fact.unit,
            effectiveAt: fact.effective_at,
            createdAt: fact.created_at,
            scopeLabel: toScopeLabel(fact.scope_type, fact.scope_id, threadMap, spaceMap),
            route: routeForScope(fact.scope_type, fact.scope_id)
        }));

        const actions: BrainActionCard[] = actionRows.map((action) => ({
            id: action.id,
            type: action.type,
            text: toActionText(action),
            status: action.status,
            scheduledFor: action.scheduled_for,
            createdAt: action.created_at,
            scopeLabel: toScopeLabel(
                action.scope_type as SupportedScope,
                action.scope_id,
                threadMap,
                spaceMap
            ),
            route: routeForScope(action.scope_type as SupportedScope, action.scope_id)
        }));

        return {
            entities,
            facts,
            actions,
            loadedAt: Date.now()
        };
    }
};
