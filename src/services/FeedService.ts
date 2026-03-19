import { Action, ActionRepo, parseActionPayload } from '../repositories/action_repo';
import { Fact, FactRepo } from '../repositories/fact_repo';
import { FeedItem, FeedRepo } from '../repositories/feed_repo';
import { safeJsonParse } from '../repositories/json_utils';
import { Space, SpaceRepo } from '../repositories/space_repo';
import { Thread, ThreadRepo } from '../repositories/thread_repo';

type SupportedScope = 'thread' | 'space' | 'global';

const routeForScope = (scopeType: SupportedScope, scopeId: string | null): string | undefined => {
    if (scopeType === 'thread' && scopeId) return `/thread/${scopeId}`;
    if (scopeType === 'space' && scopeId) return `/space/${scopeId}`;
    return undefined;
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

const formatFactValue = (fact: Fact): string => {
    const parsed = safeJsonParse<any>(fact.value_json, fact.value_json);
    let rendered: string;

    if (parsed === null || parsed === undefined) {
        rendered = 'null';
    } else if (typeof parsed === 'string') {
        rendered = parsed;
    } else if (typeof parsed === 'number' || typeof parsed === 'boolean') {
        rendered = String(parsed);
    } else {
        try {
            rendered = JSON.stringify(parsed);
        } catch {
            rendered = String(parsed);
        }
    }

    if (fact.unit) return `${rendered} ${fact.unit}`.trim();
    return rendered;
};

const normalizeReminderText = (action: Action | undefined): string => {
    if (!action) return 'Reminder';
    const payload = parseActionPayload<{ text?: string }>(action, {});
    if (typeof payload.text === 'string' && payload.text.trim().length > 0) {
        return payload.text.trim();
    }
    return 'Reminder';
};

const getActionTitle = (feedType: string): string => {
    if (feedType === 'action_done') return 'Reminder completed';
    if (feedType === 'action_canceled') return 'Reminder canceled';
    if (feedType === 'action_snoozed') return 'Reminder snoozed';
    return 'Reminder scheduled';
};

const humanizeFallbackType = (type: string): string => {
    return type
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

export interface FeedCard {
    id: string;
    feedType: string;
    title: string;
    description: string;
    createdAt: number;
    route?: string;
    scopeLabel?: string;
    actionId?: string;
    actionStatus?: Action['status'];
    canMarkDone?: boolean;
    canCancel?: boolean;
}

const buildThreadAndSpaceMaps = async (
    items: FeedItem[],
    actions: Action[],
    facts: Fact[]
): Promise<{ threadMap: Map<string, Thread>; spaceMap: Map<string, Space> }> => {
    const threadIds = new Set<string>();
    const spaceIds = new Set<string>();

    items.forEach((item) => {
        if (item.type === 'thread_created' || item.type === 'thread_updated' || item.type === 'thread') {
            if (item.ref_id) threadIds.add(item.ref_id);
        }
        if (item.type === 'space_created' || item.type === 'space') {
            if (item.ref_id) spaceIds.add(item.ref_id);
        }
        if (item.space_id) {
            spaceIds.add(item.space_id);
        }
    });

    actions.forEach((action) => {
        if (action.scope_type === 'thread' && action.scope_id) threadIds.add(action.scope_id);
        if (action.scope_type === 'space' && action.scope_id) spaceIds.add(action.scope_id);
    });

    facts.forEach((fact) => {
        if (fact.scope_type === 'thread' && fact.scope_id) threadIds.add(fact.scope_id);
        if (fact.scope_type === 'space' && fact.scope_id) spaceIds.add(fact.scope_id);
    });

    const threads = await ThreadRepo.getByIds([...threadIds]);
    threads.forEach((thread) => {
        if (thread.space_id) spaceIds.add(thread.space_id);
    });
    const spaces = await SpaceRepo.getByIds([...spaceIds]);

    return {
        threadMap: new Map(threads.map((thread) => [thread.id, thread])),
        spaceMap: new Map(spaces.map((space) => [space.id, space]))
    };
};

const toActionCard = (
    item: FeedItem,
    action: Action | undefined,
    threadMap: Map<string, Thread>,
    spaceMap: Map<string, Space>
): FeedCard => {
    const reminderText = normalizeReminderText(action);
    const scheduledAt = action?.scheduled_for || item.scheduled_for || null;
    const whenLabel = scheduledAt ? ` for ${new Date(scheduledAt).toLocaleString()}` : '';
    const scopeType = (action?.scope_type || 'global') as SupportedScope;
    const scopeId = action?.scope_id || null;

    return {
        id: item.id,
        feedType: item.type,
        title: getActionTitle(item.type),
        description: `"${reminderText}"${whenLabel}`,
        createdAt: item.created_at,
        route: routeForScope(scopeType, scopeId),
        scopeLabel: toScopeLabel(scopeType, scopeId, threadMap, spaceMap),
        actionId: action?.id,
        actionStatus: action?.status,
        canMarkDone: action?.status === 'open',
        canCancel: action?.status === 'open'
    };
};

const toFactCard = (
    item: FeedItem,
    fact: Fact | undefined,
    threadMap: Map<string, Thread>,
    spaceMap: Map<string, Space>
): FeedCard => {
    if (!fact) {
        return {
            id: item.id,
            feedType: item.type,
            title: 'Fact captured',
            description: `Fact reference ${item.ref_id}`,
            createdAt: item.created_at
        };
    }

    return {
        id: item.id,
        feedType: item.type,
        title: 'Fact captured',
        description: `${fact.key}: ${formatFactValue(fact)}`,
        createdAt: item.created_at,
        route: routeForScope(fact.scope_type, fact.scope_id),
        scopeLabel: toScopeLabel(fact.scope_type, fact.scope_id, threadMap, spaceMap)
    };
};

const toThreadCard = (
    item: FeedItem,
    threadMap: Map<string, Thread>,
    spaceMap: Map<string, Space>
): FeedCard => {
    const thread = threadMap.get(item.ref_id);
    const space = thread?.space_id ? spaceMap.get(thread.space_id) : undefined;
    const title = item.type === 'thread_updated' ? 'Thread updated' : 'Thread created';

    return {
        id: item.id,
        feedType: item.type,
        title,
        description: thread ? thread.title : `Thread ${item.ref_id}`,
        createdAt: item.created_at,
        route: item.ref_id ? `/thread/${item.ref_id}` : undefined,
        scopeLabel: space ? `Space: ${space.name}` : undefined
    };
};

const toSpaceCard = (
    item: FeedItem,
    spaceMap: Map<string, Space>
): FeedCard => {
    const space = spaceMap.get(item.ref_id);
    return {
        id: item.id,
        feedType: item.type,
        title: 'Space created',
        description: space?.name || `Space ${item.ref_id}`,
        createdAt: item.created_at,
        route: item.ref_id ? `/space/${item.ref_id}` : undefined,
        scopeLabel: 'Space'
    };
};

export const FeedService = {
    listCards: async (spaceId?: string, limit = 80): Promise<FeedCard[]> => {
        const items = await FeedRepo.getFeed(spaceId, limit);
        if (items.length === 0) return [];

        const actionIds = items
            .filter((item) => item.type.startsWith('action'))
            .map((item) => item.ref_id)
            .filter(Boolean);
        const factIds = items
            .filter((item) => item.type === 'fact')
            .map((item) => item.ref_id)
            .filter(Boolean);

        const [actions, facts] = await Promise.all([
            ActionRepo.getByIds(actionIds),
            FactRepo.getByIds(factIds)
        ]);

        const actionMap = new Map(actions.map((action) => [action.id, action]));
        const factMap = new Map(facts.map((fact) => [fact.id, fact]));
        const { threadMap, spaceMap } = await buildThreadAndSpaceMaps(items, actions, facts);

        return items.map((item) => {
            if (item.type.startsWith('action')) {
                return toActionCard(item, actionMap.get(item.ref_id), threadMap, spaceMap);
            }
            if (item.type === 'fact') {
                return toFactCard(item, factMap.get(item.ref_id), threadMap, spaceMap);
            }
            if (item.type === 'thread_created' || item.type === 'thread_updated' || item.type === 'thread') {
                return toThreadCard(item, threadMap, spaceMap);
            }
            if (item.type === 'space_created' || item.type === 'space') {
                return toSpaceCard(item, spaceMap);
            }

            return {
                id: item.id,
                feedType: item.type,
                title: humanizeFallbackType(item.type),
                description: item.ref_id ? `Reference ${item.ref_id}` : 'Activity recorded',
                createdAt: item.created_at
            };
        });
    }
};
