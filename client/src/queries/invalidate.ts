import type { QueryClient } from '@tanstack/react-query';

/** After logging or deleting a game: refresh everything derived from personal games. */
export function invalidatePersonalData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['personal'] }),
    // Matchup analytics can blend personal results in (include_personal).
    queryClient.invalidateQueries({ queryKey: ['matchups'] }),
  ]);
}

/** After creating or deleting a saved deck. */
export function invalidateSavedDecks(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['saved-decks'] });
}
