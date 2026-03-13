# Youji Onboarding Flow

Status: PLANNED — do not build until launch prep phase.

## Goal

Help the user reach the "wow moment" in their first session. The wow moment occurs when the system reveals a potential journey emerging from the user's saved items.

## The Problem

The wow moment requires at least 3–4 items in the same geographic region for clustering to work. Users who save 1–2 items and leave may never experience the product's core value.

## The Solution: Guided First Save

After signup, instead of dropping users into an empty inbox, show a guided rapid-entry prompt:

"Add the places you're dreaming about visiting."

The input supports rapid entry (Enter-to-add). Example placeholder suggestions: Tokyo, Kyoto, Osaka, Mt Fuji.

User quickly adds 4–6 destinations. The system detects a geographic cluster.

The UI reveals: "Looks like you're planning a trip in Japan." with a button: "Create trip from these."

User taps. Trip is created with destinations, saved items assigned, in geographic order.

## Why This Works

- The user immediately understands: "This app turns ideas into trips."
- They've invested content into the product in the first 60 seconds.
- The rapid entry flow demonstrates the product's core save-to-plan pipeline.
- They leave the first session with a trip already started.

## Dependencies

- Rapid capture flow (multi-add entry system)
- Geographic clustering logic
- Trip creation from cluster suggestion
