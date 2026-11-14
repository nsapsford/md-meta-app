/**
 * Shown in place of Ladder EV / Pick Strategy rankings while no real matchup results exist.
 * The tier list on the dashboard is measured from ladder data and does not need this.
 */
export default function NoMatchupData() {
  return (
    <div className="border border-md-border/50 rounded-xl p-4 text-sm space-y-2">
      <p className="font-semibold text-md-text">Not enough matchup data to rank decks</p>
      <p className="text-md-textMuted">
        Untapped's public data gives each deck's overall results but not its results against each opponent, and tournament
        matchups are too sparse, so any ranking here would be a guess dressed up as a number.
      </p>
      <p className="text-md-textMuted">
        For which decks are strongest on the ladder, use the tier list on the dashboard. Matchups appear here once enough real
        games are recorded — log your own games in My Games to build your personal spread.
      </p>
    </div>
  );
}
