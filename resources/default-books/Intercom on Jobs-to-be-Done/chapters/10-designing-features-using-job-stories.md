---
title: Designing features using Job Stories
chapter_index: 10
page_range:
  - 36
  - 43
---

When Des asked me to contribute to Inside Intercom, I had just introduced Jobs-to-be-Done to my co-founders at Aim – an advertising marketplace for the real estate industry.

Our design process was riddled with ambiguity and lacked consensus. Myself, the CEO, the CTO and the head of design all had suggestions on what to design. But we didn’t have any effective way to support one idea and challenge another.

Then it dawned on me. Without making any reference to Jobs-to-be-Done, I began pointing out the most successful suggestions my co-founders had proposed. I explained the struggling moment our customers faced, and described how their life would be better once it was solved. Then I explained how their suggestion was a good fit for this design problem. In effect, I described the customer’s job and what it was like for them when it was done.

Using Jobs-to-be-Done language to communicate, we were able to knock out our first design in only a few minutes. We never looked back.

• • •

Personas and user stories made sense when customers and product teams were far from each other. That’s no longer the case.

Traditionally, who the customer was and what they needed fell within the responsibility of marketing, business development, or even sales. Once this information was gathered, it would be synthesized into a portable format and then pitched over the fence to the product development team.

The casualties of this waterfall process are the subtleties essential to creating great products: causality, anxieties, and motivations. Jobs-to-beDone is the philosophy of focusing on these subtleties. And a granular way to bring this concept into a product is to use Job Stories to design features, UI, and UX.

### How personas fail

As Des discussed earlier, personas are often defined by attributes that have nothing to do with causality. For example, someone’s age, sex, race, and weekend habits doesn’t explain why they ate a Snickers bar. Having 30 seconds to buy and eat something which will stave off hunger for 30 minutes does explain it though.

### How user stories fail

“As a user, I can indicate folders not to backup so my backup drive isn’t filled up with things I don’t need saved.”

User stories, such as the one above, have three big problems:

1. They use personas.

2. They couple implementation with motivations and outcomes.

3. They ignore context, situations and anxieties.

Features fail often. If a feature was defined by a user story, discovering why it failed will be difficult, because implementation was coupled with motivations and outcomes. Because of the coupling, how can anyone know what was wrong? Was the implementation wrong, or were the assumptions about the motivations wrong?

### Enter the Job Story

First mentioned by Paul Adams on the Intercom blog, and developed here, Job Stories are a different way of designing features. But how does a team implement them into their workflow?

Here’s one approach:

1. Start with the high level job.

2. Identify smaller jobs that help resolve the high level job.

3. Observe how people solve the problem now (the job they currently use).

4. Come up with a Job Story to investigate the causality, anxieties and motivations of

what they do now.

5. Create a solution which resolves that Job Story.

For example, consider how a team might design a profile view for a product that helps car salespeople secure loans for customers.

### Designing a profile view

Early in the design process, the team was discussing what the profile would look like, and what features should exist there. At one point Sara, a team member, stood up and drew a simple wireframe on the whiteboard. She pointed to a box and said, “This is the salesperson’s profile”. The team is not immediately convinced by her rationale. They asked a series of “whys” for each part of the profile view. Even after all of these questions, the team didn’t coalesce for or against the idea. At this point, the question was asked: “Why should the product have a profile view? Why should it be in one place or another? What information should it display? What situations is it resolving? What job is this profile view doing?” To resolve this, the feature was reframed through Job Stories.

### Start with the high level job

The product’s high level job is to help a car salesperson secure a loan for prospective customers. Currently, the customer and the salesperson have to fill out a lot of difficult paperwork.

### Identify a smaller job which helps resolve the high level job

In order to fill the loan application out correctly, the salesperson and customer need to enter

lots of information about the car and the terms of loan. Because the information is sensitive, the customer needs to feel their personal information is safe with the car salesperson.

### Observe how people solve the problem now (i.e. what job they currently use)

When filling out this type of information, the buyer analyzes (usually visually) the salesperson and car dealership and deduces if they can be trusted. They generally fill in their sensitive financial information in close physical proximity, on a piece of paper, with the salesperson. This helps them feel confident the information is filled out correctly, and won’t get passed around to people who shouldn’t be looking at it.

### Come up with a Job Story that investigates the causality, anxieties and motivations of what they do now

1. When car salespeople and their customers interact with each other via the product…

2. …customers want to feel like they can trust the organization, process, and the

salesperson.

3. Salespeople are going to want to be confident their process makes their customers feel

comfortable…

4. …so clients will feel safe entering their financial information into a process.

The above frames the situation into a Job Story. It can be fleshed out by providing more situational context – such as when and where it’s being filled out (e.g. at home or at the dealership) – and anxieties each party will have about having and viewing a profile.

### Create a solution which resolves that Job Story

To resolve the job, the team decided how the profile view should be designed. Too little information and the profile view won’t solve the original job, and too much information could have negative effects. So the team decided:

1. When the customer uses the product, the salesperson’s profile view would always

be visible (to ease customers’ anxieties about not being physically with the

salesperson).

2. The profile would have a picture of the salesperson, job title, cars sold and years at the

company (to ease customers’ anxieties about whether the salesperson is reputable

and can be trusted).

3. The profile view will enable easy ways for the customer to get in touch with the sales-

person, such as their phone number, email address and a button saying “Ask

[salesperson] a question” (to ease customers’ anxieties about filling out the form

incorrectly).

### Here is an example of a solution:

### Here is a breakdown of the UI – the job each UI element is doing, and what sitution(s) it’s resolving.

Reinforce personal connection

Eases customer’s anxiety about not physically being with salesperson Reminds customer who Joey is

Eases customer’s anxieties about whether

the salesperson is reputable and trustworthy

Social proof that Joey is established Joey is easy to get in touch with and others trust him

Eases customer’s anxieties about filling out the form themselves and getting something wrong

### We’re now left with a product in which every element can be traced back to resolving a job: ensuring the customer feels safe when exposing personal information.

## Design for real people, design for causality

### Designing successful products means observing how real people solve problems now, exploring the context of the situation they are in, and then understanding causality,

anxieties and motivations.

Abstracted attributes and coupling implementation with motivations and outcomes are distractions for a team. If the team digs deep and learns about a customer’s Job-to-be-Done, they craft solutions more effectively. And using Job Stories to design products is one of the best ways to do it.
