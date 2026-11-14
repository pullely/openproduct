"use client";

import * as React from "react";

import { MAKER_MATCH_LABELS, makerPath } from "@openproduct/contracts";

import {
  canExpandPerson,
  personLine,
  personName,
  personProducts,
  type SearchPerson,
} from "./segments";

import { initialsOf } from "../feed/tile";
import { FOCUS } from "../ui/design";
import { ChevronIcon } from "../ui/icons";
import { AppLink } from "../ui/link";

/**
 * A person in the results (openproduct-redesign OPR1, boards `Search` and
 * `PhoneSearch`).
 *
 * ONE ROW, AND THEIR PRODUCTS ONLY ONCE IT IS OPENED (design.md §2 rule 6):
 * the disc with their initials, their name, one line, a link to the profile
 * and a chevron that opens the products beneath, indented on a 2px rule.
 *
 * THE CHEVRON IS THERE ONLY WHEN THERE IS SOMETHING UNDER IT. `/v1/search`
 * returns a handle, a name and which field matched, and no products for a
 * person, so today no row has one. The row is built for the list
 * (`canExpandPerson`): when a response carries `products` the chevron
 * appears and opens them; without it nothing is drawn where it would be,
 * and nothing is made up.
 *
 * NO FOLLOW HERE: a person is followed only from their own profile (rule 3).
 *
 * The profile link and the chevron are SIBLINGS — a button inside an anchor
 * is invalid HTML that browsers repair by splitting the anchor. On a phone
 * the name's own link is the way to the profile and the `View profile` pill
 * is not drawn (board `PhoneSearch`).
 */
export function PersonRow({ person }: { person: SearchPerson }) {
  const [open, setOpen] = React.useState(false);
  const name = personName(person);
  const href = makerPath(person.handle);
  const products = personProducts(person);
  const listId = React.useId();

  return (
    <li className="flex list-none flex-col gap-[10px] border-t border-line px-[10px] py-3 first:border-t-0 max-sm:gap-2 max-sm:px-0 max-sm:py-2">
      <div className="flex items-center gap-[14px] max-sm:gap-3">
        <AppLink
          href={href}
          className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-[14px] text-foreground no-underline max-sm:gap-3 ${FOCUS}`}
        >
          <span
            aria-hidden="true"
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-sunken text-[15px] font-semibold text-copy max-sm:h-[40px] max-sm:w-[40px]"
          >
            {initialsOf(name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{name}</span>
            <span className="text-[13px] text-muted-foreground">
              {personLine(person, MAKER_MATCH_LABELS[person.matched])}
            </span>
          </span>
        </AppLink>
        {canExpandPerson(person) ? (
          <button
            type="button"
            onClick={() => setOpen((was) => !was)}
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? "Hide" : "Show"} products of ${name}`}
            className={`grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full border-0 bg-transparent text-muted-foreground hover:text-foreground max-sm:h-[44px] max-sm:w-[44px] ${FOCUS}`}
          >
            <ChevronIcon up={open} className="h-[15px] w-[15px]" />
          </button>
        ) : null}
        <AppLink
          href={href}
          aria-label={`Open the profile of ${name}`}
          className={`flex min-h-[40px] shrink-0 items-center rounded-full bg-foreground/[0.06] px-4 text-[13px] font-semibold text-foreground no-underline max-sm:hidden ${FOCUS}`}
        >
          View profile
        </AppLink>
      </div>
      {canExpandPerson(person) && open ? (
        <ul
          id={listId}
          className="m-0 ml-5 flex list-none flex-col gap-[2px] border-l-2 border-sunken p-0 pl-[34px] max-sm:ml-[19px] max-sm:mr-[6px] max-sm:pl-3"
        >
          {products.map((product) => (
            <li key={product.slug} className="list-none">
              <AppLink
                href={`/${product.slug}`}
                className={`flex min-h-[48px] items-center gap-3 rounded-[14px] bg-well px-[10px] text-foreground no-underline max-sm:gap-[10px] ${FOCUS}`}
              >
                <span
                  aria-hidden="true"
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] bg-sunken text-label font-semibold text-copy"
                >
                  {initialsOf(product.title)}
                </span>
                <span className="min-w-0 flex-1 font-semibold">{product.title}</span>
              </AppLink>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
