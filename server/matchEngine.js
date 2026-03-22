// Match Engine - Cricket match simulation based on player ratings

class MatchEngine {
  constructor(team1, team2, team1XI, team2XI) {
    this.team1 = team1;
    this.team2 = team2;
    this.team1XI = team1XI; // Array of 11 players with battingRating, bowlingRating
    this.team2XI = team2XI;
    this.overs = 20;
    this.balls = [];
    this.commentary = [];
  }

  // Calculate team's batting strength (average of top 7 batters)
  getTeamBattingStrength(xi) {
    const sorted = [...xi].sort((a, b) => b.battingRating - a.battingRating);
    const topBatters = sorted.slice(0, 7);
    return topBatters.reduce((sum, p) => sum + p.battingRating, 0) / 7;
  }

  // Calculate team's bowling strength (average of top 5 bowlers)
  getTeamBowlingStrength(xi) {
    const sorted = [...xi].sort((a, b) => b.bowlingRating - a.bowlingRating);
    const topBowlers = sorted.slice(0, 5);
    return topBowlers.reduce((sum, p) => sum + p.bowlingRating, 0) / 5;
  }

  // Simulate a single ball
  simulateBall(batter, bowler, pressure = 0) {
    const batterStrength = batter.battingRating;
    const bowlerStrength = bowler.bowlingRating;

    // Base probability calculation
    const advantage = (batterStrength - bowlerStrength) / 100;
    const wicketChance = Math.max(0.02, 0.05 - advantage * 0.03 + pressure * 0.02);

    const rand = Math.random();

    if (rand < wicketChance) {
      return { runs: 0, isWicket: true, type: this.getWicketType() };
    }

    // Run distribution based on batter quality
    const runProbs = this.getRunProbabilities(batterStrength, bowlerStrength);
    let cumulative = 0;
    const runRand = Math.random();

    for (const [runs, prob] of runProbs) {
      cumulative += prob;
      if (runRand < cumulative) {
        return { runs, isWicket: false };
      }
    }

    return { runs: 1, isWicket: false };
  }

  getRunProbabilities(batRating, bowlRating) {
    const diff = (batRating - bowlRating) / 100;

    // Better batsmen hit more boundaries, dot less
    return [
      [0, Math.max(0.25, 0.35 - diff * 0.15)],  // Dot ball
      [1, 0.30],                                  // Single
      [2, 0.15],                                  // Two
      [3, 0.03],                                  // Three
      [4, Math.min(0.18, 0.12 + diff * 0.08)],   // Four
      [6, Math.min(0.09, 0.05 + diff * 0.06)]    // Six
    ];
  }

  getWicketType() {
    const types = ['Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Caught & Bowled'];
    const weights = [0.15, 0.45, 0.15, 0.1, 0.05, 0.1];
    const rand = Math.random();
    let cumulative = 0;

    for (let i = 0; i < types.length; i++) {
      cumulative += weights[i];
      if (rand < cumulative) return types[i];
    }
    return 'Caught';
  }

  // Simulate full innings
  simulateInnings(battingXI, bowlingXI, target = null) {
    const innings = {
      runs: 0,
      wickets: 0,
      balls: 0,
      overs: 0,
      ballByBall: [],
      batterStats: {},
      bowlerStats: {},
      partnerships: [],
      extras: 0
    };

    // Initialize batter stats (batting order based on rating)
    const battingOrder = [...battingXI].sort((a, b) => {
      // Openers and top order first (specialty-based if available)
      const orderA = a.specialty === 'Opener' ? 0 : a.specialty === 'Anchor' ? 1 : 2;
      const orderB = b.specialty === 'Opener' ? 0 : b.specialty === 'Anchor' ? 1 : 2;
      if (orderA !== orderB) return orderA - orderB;
      return b.battingRating - a.battingRating;
    });

    battingOrder.forEach((p, idx) => {
      innings.batterStats[p.id] = {
        name: p.name,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        isOut: false,
        dismissal: null,
        order: idx + 1
      };
    });

    // Initialize bowler stats (pick 5-6 bowlers)
    const bowlers = [...bowlingXI]
      .sort((a, b) => b.bowlingRating - a.bowlingRating)
      .slice(0, 6);

    bowlers.forEach(p => {
      innings.bowlerStats[p.id] = {
        name: p.name,
        overs: 0,
        balls: 0,
        runs: 0,
        wickets: 0,
        economy: 0
      };
    });

    let currentBatterIdx = 0;
    let nonStrikerIdx = 1;
    let currentBowlerIdx = 0;
    let partnershipRuns = 0;
    let partnershipBalls = 0;

    // Bowl 20 overs
    for (let over = 0; over < this.overs && innings.wickets < 10; over++) {
      // Rotate bowlers (max 4 overs per bowler)
      let bowlerFound = false;
      for (let i = 0; i < bowlers.length; i++) {
        const idx = (currentBowlerIdx + i) % bowlers.length;
        if (innings.bowlerStats[bowlers[idx].id].overs < 4) {
          currentBowlerIdx = idx;
          bowlerFound = true;
          break;
        }
      }

      if (!bowlerFound) break;

      const currentBowler = bowlers[currentBowlerIdx];

      for (let ball = 0; ball < 6 && innings.wickets < 10; ball++) {
        const currentBatter = battingOrder[currentBatterIdx];

        // Calculate pressure based on game situation
        let pressure = 0;
        if (target) {
          const required = target - innings.runs;
          const ballsLeft = (this.overs * 6) - innings.balls;
          const reqRate = (required / ballsLeft) * 6;
          if (reqRate > 12) pressure = 0.3;
          else if (reqRate > 9) pressure = 0.15;
        }
        if (innings.wickets >= 7) pressure += 0.1;

        // Extras (wide/no-ball) - ~5% chance
        if (Math.random() < 0.05) {
          innings.runs += 1;
          innings.extras += 1;
          innings.bowlerStats[currentBowler.id].runs += 1;
          continue;
        }

        const result = this.simulateBall(currentBatter, currentBowler, pressure);
        innings.balls++;
        innings.batterStats[currentBatter.id].balls++;
        innings.bowlerStats[currentBowler.id].balls++;
        partnershipBalls++;

        if (result.isWicket) {
          innings.wickets++;
          innings.batterStats[currentBatter.id].isOut = true;
          innings.batterStats[currentBatter.id].dismissal = result.type;
          innings.bowlerStats[currentBowler.id].wickets++;

          // Record partnership
          innings.partnerships.push({
            batter1: battingOrder[currentBatterIdx].name,
            batter2: battingOrder[nonStrikerIdx].name,
            runs: partnershipRuns,
            balls: partnershipBalls
          });
          partnershipRuns = 0;
          partnershipBalls = 0;

          // Next batter
          currentBatterIdx = Math.max(currentBatterIdx, nonStrikerIdx) + 1;
          if (currentBatterIdx >= 11) break;

          innings.ballByBall.push({
            over: over + 1,
            ball: ball + 1,
            batter: currentBatter.name,
            bowler: currentBowler.name,
            result: 'W',
            dismissal: result.type,
            score: `${innings.runs}/${innings.wickets}`
          });
        } else {
          innings.runs += result.runs;
          innings.batterStats[currentBatter.id].runs += result.runs;
          innings.bowlerStats[currentBowler.id].runs += result.runs;
          partnershipRuns += result.runs;

          if (result.runs === 4) innings.batterStats[currentBatter.id].fours++;
          if (result.runs === 6) innings.batterStats[currentBatter.id].sixes++;

          innings.ballByBall.push({
            over: over + 1,
            ball: ball + 1,
            batter: currentBatter.name,
            bowler: currentBowler.name,
            result: result.runs.toString(),
            score: `${innings.runs}/${innings.wickets}`
          });

          // Rotate strike on odd runs
          if (result.runs % 2 === 1) {
            [currentBatterIdx, nonStrikerIdx] = [nonStrikerIdx, currentBatterIdx];
          }
        }

        // Check if chase complete
        if (target && innings.runs >= target) {
          break;
        }
      }

      // End of over - rotate strike and update bowler overs
      innings.bowlerStats[currentBowler.id].overs = Math.floor(innings.bowlerStats[currentBowler.id].balls / 6);
      [currentBatterIdx, nonStrikerIdx] = [nonStrikerIdx, currentBatterIdx];
      currentBowlerIdx = (currentBowlerIdx + 1) % bowlers.length;

      if (target && innings.runs >= target) break;
    }

    innings.overs = Math.floor(innings.balls / 6) + (innings.balls % 6) / 10;

    // Calculate economies
    Object.keys(innings.bowlerStats).forEach(id => {
      const bs = innings.bowlerStats[id];
      if (bs.balls > 0) {
        bs.economy = (bs.runs / (bs.balls / 6)).toFixed(2);
      }
    });

    return innings;
  }

  // Simulate full match
  simulateMatch() {
    // Toss
    const tossWinner = Math.random() < 0.5 ? this.team1 : this.team2;
    const tossDecision = Math.random() < 0.6 ? 'bat' : 'bowl'; // Teams prefer batting first 60%

    let battingFirst, bowlingFirst;
    let battingFirstXI, bowlingFirstXI;

    if ((tossWinner.id === this.team1.id && tossDecision === 'bat') ||
        (tossWinner.id === this.team2.id && tossDecision === 'bowl')) {
      battingFirst = this.team1;
      bowlingFirst = this.team2;
      battingFirstXI = this.team1XI;
      bowlingFirstXI = this.team2XI;
    } else {
      battingFirst = this.team2;
      bowlingFirst = this.team1;
      battingFirstXI = this.team2XI;
      bowlingFirstXI = this.team1XI;
    }

    // First innings
    const firstInnings = this.simulateInnings(battingFirstXI, bowlingFirstXI);

    // Second innings (chase)
    const target = firstInnings.runs + 1;
    const secondInnings = this.simulateInnings(bowlingFirstXI, battingFirstXI, target);

    // Determine winner
    let winner, margin;
    if (secondInnings.runs >= target) {
      winner = bowlingFirst;
      margin = `by ${10 - secondInnings.wickets} wickets`;
    } else {
      winner = battingFirst;
      margin = `by ${firstInnings.runs - secondInnings.runs} runs`;
    }

    return {
      toss: {
        winner: tossWinner.id,
        decision: tossDecision
      },
      firstInnings: {
        teamId: battingFirst.id,
        teamName: battingFirst.name,
        ...firstInnings
      },
      secondInnings: {
        teamId: bowlingFirst.id,
        teamName: bowlingFirst.name,
        target,
        ...secondInnings
      },
      winner: winner.id,
      winnerName: winner.name,
      margin,
      playerOfMatch: this.selectPlayerOfMatch(firstInnings, secondInnings, battingFirstXI, bowlingFirstXI)
    };
  }

  selectPlayerOfMatch(firstInnings, secondInnings, team1XI, team2XI) {
    let bestPlayer = null;
    let bestScore = 0;

    const allPlayers = [...team1XI, ...team2XI];

    allPlayers.forEach(player => {
      let score = 0;

      // Batting contribution
      const batStats1 = firstInnings.batterStats[player.id];
      const batStats2 = secondInnings.batterStats[player.id];
      if (batStats1) score += batStats1.runs * 1.5 + batStats1.fours * 2 + batStats1.sixes * 3;
      if (batStats2) score += batStats2.runs * 1.5 + batStats2.fours * 2 + batStats2.sixes * 3;

      // Bowling contribution
      const bowlStats1 = firstInnings.bowlerStats[player.id];
      const bowlStats2 = secondInnings.bowlerStats[player.id];
      if (bowlStats1) score += bowlStats1.wickets * 25 - bowlStats1.economy * 2;
      if (bowlStats2) score += bowlStats2.wickets * 25 - bowlStats2.economy * 2;

      if (score > bestScore) {
        bestScore = score;
        bestPlayer = player;
      }
    });

    return bestPlayer ? { id: bestPlayer.id, name: bestPlayer.name } : null;
  }
}

module.exports = MatchEngine;
