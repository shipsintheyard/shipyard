"use client";

import React, { useState, useEffect } from 'react';

interface DailyForecast {
  date: string;
  dayName: string;
  fearGreedIndex: number;
  fearGreedLabel: string;
  condition: 'storm' | 'cloudy' | 'clearing' | 'sunny' | 'hot';
}

interface WeatherData {
  fearGreedIndex: number;
  fearGreedLabel: string;
  btcFundingRate: number;
  ethFundingRate: number;
  btcPrice: number;
  btcChange24h: number;
  ethChange24h: number;
  marketCondition: 'storm' | 'cloudy' | 'clearing' | 'sunny' | 'hot';
  forecast: string;
  confidence: number;
  lastUpdated: Date;
  dailyForecast: DailyForecast[];
}

const WEATHER_CONDITIONS = {
  storm: {
    icon: '🌧️',
    label: 'STORMY',
    color: '#EF4444',
    bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    description: 'High risk - Exercise caution'
  },
  cloudy: {
    icon: '⛅',
    label: 'CLOUDY',
    color: '#F59E0B',
    bg: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
    description: 'Mixed signals - Be selective'
  },
  clearing: {
    icon: '🌤️',
    label: 'CLEARING',
    color: '#60A5FA',
    bg: 'linear-gradient(135deg, #1e3a5f 0%, #2d4a6f 100%)',
    description: 'Improving conditions'
  },
  sunny: {
    icon: '☀️',
    label: 'SUNNY',
    color: '#4ADE80',
    bg: 'linear-gradient(135deg, #134e4a 0%, #1e5f5a 100%)',
    description: 'Risk on - Good conditions'
  },
  hot: {
    icon: '🔥',
    label: 'OVERHEATED',
    color: '#F97316',
    bg: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 100%)',
    description: 'Caution - Potential reversal'
  }
};

const getConditionFromFearGreed = (index: number): 'storm' | 'cloudy' | 'clearing' | 'sunny' | 'hot' => {
  if (index <= 20) return 'storm';
  if (index <= 35) return 'cloudy';
  if (index <= 55) return 'clearing';
  if (index <= 75) return 'sunny';
  return 'hot';
};

const getDayName = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

export default function WeatherForecast() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'now' | '7day'>('now');
  const [selectedDay, setSelectedDay] = useState<number>(0);

  const fetchWeatherData = async () => {
    try {
      // Fetch 7 days of Fear & Greed Index
      const fgResponse = await fetch('https://api.alternative.me/fng/?limit=7');
      const fgData = await fgResponse.json();

      const fearGreedIndex = parseInt(fgData.data[0].value);
      const fearGreedLabel = fgData.data[0].value_classification;

      // Build daily forecast from historical data
      const dailyForecast: DailyForecast[] = fgData.data.map((day: any, index: number) => {
        const fgValue = parseInt(day.value);
        return {
          date: new Date(parseInt(day.timestamp) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          dayName: index === 0 ? 'Today' : getDayName(parseInt(day.timestamp)),
          fearGreedIndex: fgValue,
          fearGreedLabel: day.value_classification,
          condition: getConditionFromFearGreed(fgValue)
        };
      });

      // Fetch BTC price and funding rates
      let btcFundingRate = 0;
      let ethFundingRate = 0;
      let btcPrice = 0;
      let btcChange24h = 0;
      let ethChange24h = 0;

      try {
        // Use CoinGecko for prices (no geo-restrictions)
        const priceRes = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true'
        );
        const priceData = await priceRes.json();
        btcPrice = priceData.bitcoin?.usd || 0;
        btcChange24h = priceData.bitcoin?.usd_24h_change || 0;
        ethChange24h = priceData.ethereum?.usd_24h_change || 0;
      } catch (e) {
        console.warn('Could not fetch price data:', e);
      }

      try {
        // Use OKX for funding rates (more accessible than Binance)
        const [btcFundingRes, ethFundingRes] = await Promise.all([
          fetch('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP'),
          fetch('https://www.okx.com/api/v5/public/funding-rate?instId=ETH-USDT-SWAP')
        ]);

        const btcFundingData = await btcFundingRes.json();
        const ethFundingData = await ethFundingRes.json();

        // fundingRate is already in decimal form (e.g., 0.0001 = 0.01%)
        btcFundingRate = parseFloat(btcFundingData.data?.[0]?.fundingRate || 0) * 100;
        ethFundingRate = parseFloat(ethFundingData.data?.[0]?.fundingRate || 0) * 100;
      } catch (e) {
        console.warn('Could not fetch funding rates:', e);
      }

      // Calculate market condition
      let marketCondition = getConditionFromFearGreed(fearGreedIndex);
      let forecast = '';
      let confidence = 50;

      // Fear & Greed analysis
      if (fearGreedIndex <= 20) {
        forecast = 'Extreme fear - potential capitulation or bounce opportunity';
        confidence = 70;
      } else if (fearGreedIndex <= 35) {
        forecast = 'Fear in the market - proceed with caution';
        confidence = 60;
      } else if (fearGreedIndex <= 55) {
        forecast = 'Neutral sentiment - watch for direction';
        confidence = 50;
      } else if (fearGreedIndex <= 75) {
        forecast = 'Greed building - good momentum but watch for tops';
        confidence = 65;
      } else {
        forecast = 'Extreme greed - market may be overheated';
        confidence = 75;
      }

      // Adjust based on funding rates (now using correct percentage values)
      if (btcFundingRate > 0.05) {
        if (marketCondition === 'sunny') marketCondition = 'hot';
        forecast += '. High funding suggests overleveraged longs.';
        confidence += 10;
      } else if (btcFundingRate < -0.02) {
        if (marketCondition === 'storm') {
          forecast += '. Negative funding may signal a bottom.';
        }
        confidence += 5;
      }

      // Trend analysis from 7-day data
      const trend = dailyForecast.length >= 3
        ? dailyForecast[0].fearGreedIndex - dailyForecast[2].fearGreedIndex
        : 0;

      if (Math.abs(trend) >= 10) {
        const trendDirection = trend > 0 ? 'improving' : 'declining';
        forecast += ` Sentiment ${trendDirection} over past 3 days.`;
      }

      setWeather({
        fearGreedIndex,
        fearGreedLabel,
        btcFundingRate,
        ethFundingRate,
        btcPrice,
        btcChange24h,
        ethChange24h,
        marketCondition,
        forecast,
        confidence: Math.min(confidence, 95),
        lastUpdated: new Date(),
        dailyForecast
      });
      setError(null);
    } catch (err) {
      console.error('Failed to fetch weather data:', err);
      setError('Unable to fetch market data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchWeatherData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{
        background: '#0B1120',
        border: '1px solid #1E2A3A',
        borderRadius: '12px',
        padding: '24px',
        fontFamily: "'IBM Plex Mono', monospace"
      }}>
        <div style={{ color: '#6B7B8F', textAlign: 'center' }}>
          Checking weather conditions...
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div style={{
        background: '#0B1120',
        border: '1px solid #1E2A3A',
        borderRadius: '12px',
        padding: '24px',
        fontFamily: "'IBM Plex Mono', monospace"
      }}>
        <div style={{ color: '#EF4444', textAlign: 'center' }}>
          {error || 'Unable to load weather data'}
        </div>
      </div>
    );
  }

  const currentCondition = view === '7day' && selectedDay > 0
    ? WEATHER_CONDITIONS[weather.dailyForecast[selectedDay]?.condition || 'cloudy']
    : WEATHER_CONDITIONS[weather.marketCondition];

  const displayData = view === '7day' && selectedDay > 0
    ? weather.dailyForecast[selectedDay]
    : { fearGreedIndex: weather.fearGreedIndex, fearGreedLabel: weather.fearGreedLabel };

  return (
    <div style={{
      background: currentCondition.bg,
      border: '1px solid #1E2A3A',
      borderRadius: '12px',
      padding: '20px',
      fontFamily: "'IBM Plex Mono', monospace",
      transition: 'all 0.3s ease'
    }}>
      {/* Header with View Toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: '#6B7B8F'
        }}>
          MARKET WEATHER
        </div>
        <div style={{
          display: 'flex',
          gap: '4px',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '6px',
          padding: '3px'
        }}>
          <button
            onClick={() => { setView('now'); setSelectedDay(0); }}
            style={{
              background: view === 'now' ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '10px',
              fontWeight: 600,
              color: view === 'now' ? '#E2E8F0' : '#6B7B8F',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            NOW
          </button>
          <button
            onClick={() => setView('7day')}
            style={{
              background: view === '7day' ? 'rgba(255,255,255,0.15)' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '10px',
              fontWeight: 600,
              color: view === '7day' ? '#E2E8F0' : '#6B7B8F',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            7 DAY
          </button>
        </div>
      </div>

      {/* Current Weather Display */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '40px' }}>{currentCondition.icon}</span>
          <div>
            <div style={{
              fontSize: '20px',
              fontWeight: 700,
              color: currentCondition.color,
              letterSpacing: '0.05em'
            }}>
              {currentCondition.label}
            </div>
            <div style={{
              fontSize: '11px',
              color: '#6B7B8F'
            }}>
              {currentCondition.description}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: 700,
            color: '#E2E8F0'
          }}>
            {displayData.fearGreedIndex}
          </div>
          <div style={{
            fontSize: '9px',
            color: '#6B7B8F',
            letterSpacing: '0.05em'
          }}>
            FEAR & GREED
          </div>
        </div>
      </div>

      {/* 7-Day Forecast View */}
      {view === '7day' && (
        <div style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '16px',
          overflowX: 'auto',
          paddingBottom: '4px'
        }}>
          {weather.dailyForecast.map((day, index) => {
            const dayCondition = WEATHER_CONDITIONS[day.condition];
            const isSelected = selectedDay === index;
            return (
              <div
                key={index}
                onClick={() => setSelectedDay(index)}
                style={{
                  flex: '1',
                  minWidth: '52px',
                  background: isSelected ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.3)',
                  borderRadius: '8px',
                  padding: '10px 6px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  border: isSelected ? `1px solid ${dayCondition.color}` : '1px solid transparent',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{
                  fontSize: '9px',
                  color: '#6B7B8F',
                  marginBottom: '6px',
                  fontWeight: 600
                }}>
                  {day.dayName}
                </div>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>
                  {dayCondition.icon}
                </div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: dayCondition.color
                }}>
                  {day.fearGreedIndex}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fear & Greed Gauge (Now view only) */}
      {view === 'now' && (
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '14px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '9px', color: '#6B7B8F', letterSpacing: '0.1em' }}>
              SENTIMENT GAUGE
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: currentCondition.color
            }}>
              {weather.fearGreedLabel}
            </span>
          </div>

          {/* Gauge Bar */}
          <div style={{
            position: 'relative',
            height: '8px',
            background: 'linear-gradient(90deg, #EF4444 0%, #F59E0B 25%, #6B7B8F 50%, #4ADE80 75%, #F97316 100%)',
            borderRadius: '4px',
            marginBottom: '6px'
          }}>
            <div style={{
              position: 'absolute',
              left: `${weather.fearGreedIndex}%`,
              top: '-4px',
              transform: 'translateX(-50%)',
              width: '14px',
              height: '14px',
              background: '#fff',
              borderRadius: '50%',
              border: '2px solid #0B1120',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
            }} />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '8px',
            color: '#6B7B8F'
          }}>
            <span>Fear</span>
            <span>Greed</span>
          </div>
        </div>
      )}

      {/* Forecast Text */}
      <div style={{
        fontSize: '11px',
        color: '#E2E8F0',
        lineHeight: '1.5',
        marginBottom: '14px',
        padding: '12px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '8px',
        borderLeft: `3px solid ${currentCondition.color}`
      }}>
        {weather.forecast}
      </div>

      {/* Market Stats (Now view only) */}
      {view === 'now' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px'
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '8px', color: '#6B7B8F', marginBottom: '4px', letterSpacing: '0.05em' }}>
              BTC 24H
            </div>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: weather.btcChange24h >= 0 ? '#4ADE80' : '#EF4444'
            }}>
              {weather.btcChange24h >= 0 ? '+' : ''}{weather.btcChange24h.toFixed(1)}%
            </div>
          </div>
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '8px', color: '#6B7B8F', marginBottom: '4px', letterSpacing: '0.05em' }}>
              ETH 24H
            </div>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: weather.ethChange24h >= 0 ? '#4ADE80' : '#EF4444'
            }}>
              {weather.ethChange24h >= 0 ? '+' : ''}{weather.ethChange24h.toFixed(1)}%
            </div>
          </div>
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '8px', color: '#6B7B8F', marginBottom: '4px', letterSpacing: '0.05em' }}>
              BTC FUND
            </div>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: weather.btcFundingRate > 0.03 ? '#F97316' :
                     weather.btcFundingRate < -0.01 ? '#4ADE80' : '#E2E8F0'
            }}>
              {weather.btcFundingRate >= 0 ? '+' : ''}{weather.btcFundingRate.toFixed(3)}%
            </div>
          </div>
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '8px', color: '#6B7B8F', marginBottom: '4px', letterSpacing: '0.05em' }}>
              ETH FUND
            </div>
            <div style={{
              fontSize: '12px',
              fontWeight: 700,
              color: weather.ethFundingRate > 0.03 ? '#F97316' :
                     weather.ethFundingRate < -0.01 ? '#4ADE80' : '#E2E8F0'
            }}>
              {weather.ethFundingRate >= 0 ? '+' : ''}{weather.ethFundingRate.toFixed(3)}%
            </div>
          </div>
        </div>
      )}

      {/* Last Updated */}
      <div style={{
        fontSize: '8px',
        color: '#6B7B8F',
        marginTop: '12px',
        textAlign: 'center'
      }}>
        Updated {weather.lastUpdated.toLocaleTimeString()}
      </div>
    </div>
  );
}
