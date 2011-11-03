/*
 * CommitListTable.java
 *
 * Copyright (C) 2009-11 by RStudio, Inc.
 *
 * This program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
package org.rstudio.studio.client.workbench.views.vcs.dialog;

import com.google.gwt.cell.client.AbstractSafeHtmlCell;
import com.google.gwt.cell.client.Cell;
import com.google.gwt.core.client.GWT;
import com.google.gwt.core.client.Scheduler;
import com.google.gwt.core.client.Scheduler.ScheduledCommand;
import com.google.gwt.event.shared.HandlerRegistration;
import com.google.gwt.i18n.client.DateTimeFormat;
import com.google.gwt.i18n.client.DateTimeFormat.PredefinedFormat;
import com.google.gwt.safehtml.shared.SafeHtml;
import com.google.gwt.safehtml.shared.SafeHtmlBuilder;
import com.google.gwt.text.shared.SafeHtmlRenderer;
import com.google.gwt.user.cellview.client.CellTable;
import com.google.gwt.user.cellview.client.Column;
import com.google.gwt.user.cellview.client.TextColumn;
import com.google.gwt.view.client.RangeChangeEvent;
import com.google.gwt.view.client.SelectionChangeEvent;
import com.google.gwt.view.client.SingleSelectionModel;
import org.rstudio.core.client.SafeHtmlUtil;
import org.rstudio.core.client.js.JsUtil;
import org.rstudio.core.client.theme.RStudioCellTableStyle;
import org.rstudio.core.client.widget.MultiSelectCellTable;
import org.rstudio.studio.client.workbench.views.vcs.dialog.HistoryPanel.Styles;
import org.rstudio.studio.client.workbench.views.vcs.dialog.HistoryPresenter.CommitListDisplay;
import org.rstudio.studio.client.workbench.views.vcs.dialog.graph.GraphLine;
import org.rstudio.studio.client.workbench.views.vcs.dialog.graph.GraphTheme;

import java.util.List;

public class CommitListTable extends MultiSelectCellTable<CommitInfo>
      implements CommitListDisplay
{
   interface Resources extends CellTable.Resources
   {
      @Override
      @Source({RStudioCellTableStyle.RSTUDIO_DEFAULT_CSS, "CommitListTableCellTableStyle.css"})
      Style cellTableStyle();
   }

   interface CommitListTableCellTableStyle extends CellTable.Style
   {
   }

   private static class CommitColumn extends Column<CommitInfo, CommitInfo>
   {
      private static class RenderCell extends AbstractSafeHtmlCell<CommitInfo>
      {
         private RenderCell(SafeHtmlRenderer<CommitInfo> commitInfoSafeHtmlRenderer,
                            String... consumedEvents)
         {
            super(commitInfoSafeHtmlRenderer, consumedEvents);
         }

         @Override
         protected void render(Context context, SafeHtml data, SafeHtmlBuilder sb)
         {
            if (data != null)
               sb.append(data);
         }
      }

      private CommitColumn(SafeHtmlRenderer<CommitInfo> renderer)
      {
         super(new RenderCell(renderer));
      }

      @Override
      public CommitInfo getValue(CommitInfo object)
      {
         return object;
      }
   }

   private class GraphRenderer implements SafeHtmlRenderer<CommitInfo>
   {
      public GraphRenderer(GraphTheme theme)
      {
         theme_ = theme;
      }

      @Override
      public SafeHtml render(CommitInfo object)
      {
         if (object.getGraph().length() == 0)
            return null;
         return new GraphLine(object.getGraph()).render(theme_);
      }

      @Override
      public void render(CommitInfo object, SafeHtmlBuilder builder)
      {
         builder.append(render(object));
      }

      private final GraphTheme theme_;
   }

   private class SubjectRenderer implements SafeHtmlRenderer<CommitInfo>
   {
      @Override
      public SafeHtml render(CommitInfo commit)
      {
         SafeHtmlBuilder builder = new SafeHtmlBuilder();

         for (String ref : JsUtil.asIterable(commit.getRefs()))
         {
            String style = styles_.ref();
            if (ref.startsWith("refs/heads/"))
            {
               ref = ref.substring("refs/heads/".length());
               style += " " + styles_.branch();
            }
            else if (ref.startsWith("refs/remotes/"))
            {
               ref = ref.substring("refs/remotes/".length());
               style += " " + styles_.remote();
            }
            else if (ref.equals("HEAD"))
            {
               style += " " + styles_.head();
            }

            SafeHtmlUtil.appendSpan(builder, style, ref);
         }
         for (String tag : JsUtil.asIterable(commit.getTags()))
         {
            if (tag.startsWith("refs/tags/"))
               tag = tag.substring("refs/tags/".length());
            SafeHtmlUtil.appendSpan(builder, styles_.tag(), tag);
         }

         builder.appendEscaped(commit.getSubject());

         return builder.toSafeHtml();
      }

      @Override
      public void render(CommitInfo object, SafeHtmlBuilder builder)
      {
         builder.append(render(object));
      }
   }

   public CommitListTable(HistoryPanel.Styles styles)
   {
      super(100,
            GWT.<Resources>create(Resources.class));
      styles_ = styles;

      graphTheme_ = new GraphTheme();
      graphCol_ = new CommitColumn(new GraphRenderer(graphTheme_));
      addColumn(graphCol_, "Graph");

      TextColumn<CommitInfo> idCol = new TextColumn<CommitInfo>()
      {
         @Override
         public String getValue(CommitInfo object)
         {
            return object.getId();
         }
      };
      addColumn(idCol, "SHA");

      CommitColumn subjectCol = new CommitColumn(new SubjectRenderer());
      addColumn(subjectCol, "Subject");

      TextColumn<CommitInfo> authorCol = new TextColumn<CommitInfo>()
      {
         @Override
         public String getValue(CommitInfo object)
         {
            return object.getAuthor();
         }
      };
      addColumn(authorCol, "Author");

      TextColumn<CommitInfo> dateCol = new TextColumn<CommitInfo>()
      {
         @Override
         public String getValue(CommitInfo object)
         {
            return DateTimeFormat.getFormat(
                  PredefinedFormat.DATE_SHORT).format(object.getDate());
         }
      };
      addColumn(dateCol, "Date");

      setColumnWidth(graphCol_, "0");
      setColumnWidth(idCol, "100px");
      setColumnWidth(subjectCol, "67%");
      setColumnWidth(authorCol, "33%");
      setColumnWidth(dateCol, "100px");

      selectionModel_ = new SingleSelectionModel<CommitInfo>();
      setSelectionModel(selectionModel_);

      addRangeChangeHandler(new RangeChangeEvent.Handler()
      {
         @Override
         public void onRangeChange(RangeChangeEvent event)
         {
            if (selectionModel_.getSelectedObject() != null)
            {
               selectionModel_.setSelected(selectionModel_.getSelectedObject(),
                                           false);
            }
            updateGraphColumnWidth();
            maybePreselectFirstRow();
         }
      });
   }

   private void updateGraphColumnWidth()
   {
      int cols = 0;
      for (CommitInfo commit : getVisibleItems())
      {
         if (commit.getGraph() != null)
         {
            cols = Math.max(
                  cols, new GraphLine(commit.getGraph()).getColumns().length);
         }
      }

      if (cols > 0)
      {
         // Looks clipped when only 1 column for some reason. Whatever.
         cols = Math.max(2, cols);

         setColumnWidth(graphCol_, (cols * graphTheme_.getColumnWidth()) + "px");
      }
      else
         setColumnWidth(graphCol_, "0");
   }

   @Override
   public void setRowData(int start, List<? extends CommitInfo> values)
   {
      super.setRowData(start, values);
      updateGraphColumnWidth();
      maybePreselectFirstRow();
   }

   private void maybePreselectFirstRow()
   {
      Scheduler.get().scheduleDeferred(new ScheduledCommand()
      {
         @Override
         public void execute()
         {
            if (getVisibleItemCount() > 0
                && selectionModel_.getSelectedObject() == null)
            {
               selectionModel_.setSelected(getVisibleItem(0), true);
            }
         }
      });
   }

   public HandlerRegistration addSelectionChangeHandler(SelectionChangeEvent.Handler handler)
   {
      return selectionModel_.addSelectionChangeHandler(handler);
   }

   @Override
   public CommitInfo getSelectedCommit()
   {
      return selectionModel_.getSelectedObject();
   }

   private final SingleSelectionModel<CommitInfo> selectionModel_;
   private final Styles styles_;
   private CommitColumn graphCol_;
   private GraphTheme graphTheme_;
}
